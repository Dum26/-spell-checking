"""Read spelling rules and catalog workbooks without editing them; build a browser dictionary."""
import collections
import hashlib
import json
from pathlib import Path
import posixpath
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def normalize(text):
    return " ".join(unicodedata.normalize("NFC", text).lower().split())


def read_rows(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(t.text or "" for t in item.findall(".//m:t", NS)) for item in root]
        relationships = {item.attrib["Id"]: item.attrib["Target"] for item in
                         ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = relationships[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            member = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            with archive.open(member) as stream:
                for _, row in ET.iterparse(stream, events=("end",)):
                    if row.tag != "{" + NS["m"] + "}row":
                        continue
                    cells = {}
                    for cell in row:
                        column = "".join(c for c in cell.attrib.get("r", "") if c.isalpha())
                        value = cell.find("m:v", NS)
                        if cell.find("m:f", NS) is not None:
                            continue
                        if cell.attrib.get("t") == "s" and value is not None:
                            cells[column] = strings[int(value.text)]
                        else:
                            cells[column] = "".join(t.text or "" for t in cell.findall(".//m:t", NS)) if value is None else value.text or ""
                    row.clear()
                    if cells:
                        yield sheet.attrib["name"], cells


def read_pairs(path):
    sheets = set()
    for sheet, cells in read_rows(path):
        if sheet not in sheets:
            if normalize(cells.get("A", "")) != "từ chuẩn" or normalize(cells.get("B", "")) != "từ sai chính tả":
                raise ValueError(f"Unexpected columns in {sheet}")
            sheets.add(sheet)
        elif cells.get("A", "").strip() and cells.get("B", "").strip():
            yield sheet, normalize(cells["A"]), normalize(cells["B"])


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c)).replace("đ", "d")


def telex(text):
    def encode(word):
        tone = ""
        letters = []
        for char in unicodedata.normalize("NFD", word):
            if char in "\u0301\u0300\u0309\u0303\u0323":
                tone = dict(zip("\u0301\u0300\u0309\u0303\u0323", "sfrxj"))[char]
            else:
                letters.append(char)
        word = "".join(letters).replace("a\u0306", "aw").replace("đ", "dd")
        word = re.sub("([aeo])\u0302", r"\1\1", word)
        return re.sub("([ou])\u031b", r"\1w", word) + tone
    return " ".join(encode(word) for word in text.split())


def safe_rule(wrong, correct):
    # Allow descriptors such as "3 cánh", but never rewrite M10, dimensions or code digits.
    numbers = lambda text: re.findall(r"\d+(?:[.,]\d+)*", text)
    technical = lambda text: [word for word in text.split() if re.search(r"\d", word)]
    if numbers(wrong) == numbers(correct) and technical(wrong) == technical(correct):
        return True
    number_words = {"không":"0", "một":"1", "hai":"2", "ba":"3", "bốn":"4", "năm":"5", "sáu":"6", "bảy":"7", "tám":"8", "chín":"9", "mười":"10"}
    expand = lambda text: " ".join(number_words.get(word, word) for word in text.split())
    wrong, correct = expand(wrong), expand(correct)
    return numbers(wrong) == numbers(correct) and technical(wrong) == technical(correct)


def catalog_vocabulary(folder):
    frequency, overrides, sources = collections.Counter(), collections.defaultdict(set), []
    for path in sorted(folder.glob("*.xlsx")):
        if path.name == "chinhta.xlsx":
            continue
        headers, rows, used = {}, 0, 0
        for sheet, cells in read_rows(path):
            if sheet not in headers:
                aliases = {"keyword tb5": "keyword", "danh mục tb5": "category_name"}
                headers[sheet] = {column: aliases.get(normalize(value), normalize(value)) for column, value in cells.items()}
                continue
            row = {headers[sheet].get(column): str(value) for column, value in cells.items()}
            rows += 1
            labels = set()
            for wrong_column, correct_column in [("synonym", "correct_word"), ("keyword", "brand_name")]:
                if row.get(wrong_column) and row.get(correct_column):
                    wrong, correct = normalize(row[wrong_column]), normalize(row[correct_column])
                    # Keep size/code conversions out of the spelling feature.
                    if safe_rule(wrong, correct):
                        overrides[wrong].add(correct)
                        labels.add(correct)
            columns = ["category_name", "brand_name", "alias_text", "value_name", "part_description"]
            if row.get("category_id") and row.get("category_name"):
                columns.append("keyword")
            for column in columns:
                value = row.get(column)
                if not value:
                    continue
                words = []
                for word in normalize(value).split():
                    word = word.strip(".,;:()[]{}'\"")
                    if not word.isalpha():
                        break
                    words.append(word)
                    if len(words) == 10:
                        break
                for length in range(1, len(words) + 1):
                    labels.add(" ".join(words[:length]))
            if labels:
                used += 1
                frequency.update(labels)
        sources.append({"file": path.name, "rows": rows, "usedRows": used,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return frequency, overrides, sources


def build(path):
    terms, variants, counts = set(), collections.defaultdict(set), collections.Counter()
    for sheet, correct, incorrect in read_pairs(path):
        terms.add(correct)
        variants[incorrect].add(correct)
        counts[sheet] += 1
    frequency, overrides, sources = catalog_vocabulary(path.parent)
    catalog_terms = set(frequency)
    terms.update(catalog_terms)
    for values in overrides.values():
        terms.update(values)
    conflicts = {key: sorted(values) for key, values in variants.items() if len(values) > 1}
    # A correct term always wins over a generated typo of another term.
    accepted = {key: next(iter(values)) for key, values in variants.items()
                if len(values) == 1 and key not in terms}
    generated = collections.defaultdict(set)
    for term in terms:
        for key in (fold(term), telex(term)):
            if key != term and key not in terms and key not in accepted:
                generated[key].add(term)
    for key, values in generated.items():
        ranked = sorted(values, key=lambda term: (-frequency[term], term))
        if len(ranked) == 1 or frequency[ranked[0]] > frequency[ranked[1]]:
            accepted[key] = ranked[0]
    explicit = {wrong: next(iter(values)) for wrong, values in overrides.items() if len(values) == 1}
    override_conflicts = {key: sorted(values) for key, values in overrides.items() if len(values) > 1}
    word_candidates = collections.defaultdict(set)
    for term in terms:
        for word in re.findall(r"[^\W\d_]+", term, flags=re.UNICODE):
            encoded = telex(word)
            if encoded != word:
                word_candidates[encoded].add(word)
    word_variants = [[key, next(iter(values))] for key, values in sorted(word_candidates.items()) if len(values) == 1]
    ordered_terms = sorted(terms)
    ids = {term: i for i, term in enumerate(ordered_terms)}
    data = {"source": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "sources": sources, "terms": ordered_terms,
            "variants": [[key, ids[value]] for key, value in sorted(accepted.items())],
            "wordVariants": word_variants,
            "overrides": [[key, ids[value]] for key, value in sorted(explicit.items())]}
    report = {"sheets": dict(counts), "rows": sum(counts.values()), "terms": len(terms),
              "variants": len(accepted), "conflicts": len(conflicts), "conflictExamples": list(conflicts.items())[:12],
              "catalogTerms": len(catalog_terms), "explicitRules": len(explicit), "sources": sources,
              "overrideConflicts": len(override_conflicts), "overrideConflictExamples": list(override_conflicts.items())[:12],
              "termExamples": ordered_terms[:35]}
    return data, report


if __name__ == "__main__":
    data, report = build(ROOT / "database/chinhta.xlsx")
    print(json.dumps({key: report[key] for key in ("rows", "terms", "variants", "catalogTerms", "explicitRules")}), flush=True)
    destination = ROOT / "spelling-dictionary.json"
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(destination)
    report["bytes"] = destination.stat().st_size
    report_path = ROOT / "output/spelling/spelling-dictionary-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))
