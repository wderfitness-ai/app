import io
import json
import sys
import base64
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


FONT_CANDIDATES = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
]


def pick_font():
    for font in FONT_CANDIDATES:
        if Path(font).exists():
            return font
    return None


def register_font():
    font_path = pick_font()
    if not font_path:
        return "Helvetica"
    name = "AppChineseFont"
    try:
        pdfmetrics.registerFont(TTFont(name, font_path))
        return name
    except Exception:
        return "Helvetica"


FONT_NAME = register_font()
PAGE_WIDTH, PAGE_HEIGHT = letter
PRIMARY = colors.HexColor("#111827")
BORDER = colors.HexColor("#D1D5DB")
HEADER_BG = colors.HexColor("#F3F4F6")
ACCENT = colors.HexColor("#DC2626")
TABLE_RED = colors.HexColor("#C9181E")
DARK = colors.HexColor("#111827")
SOFT_RED = colors.HexColor("#FDE2E2")
SUMMARY_BG = colors.HexColor("#FEF2F2")
MUTED = colors.HexColor("#6B7280")


def p(value, style):
    text = str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>").replace("&lt;br/&gt;", "<br/>")
    return Paragraph(text, style)


def money(value, currency="$"):
    try:
        return f"{currency}{float(value):,.2f}"
    except Exception:
        return str(value or "")


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName=FONT_NAME, fontSize=21, leading=25, textColor=PRIMARY, alignment=1, spaceAfter=10),
        "sub": ParagraphStyle("Sub", parent=base["Normal"], fontName=FONT_NAME, fontSize=8.8, leading=12, textColor=PRIMARY),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName=FONT_NAME, fontSize=12, leading=15, textColor=PRIMARY, spaceBefore=6, spaceAfter=6),
        "body": ParagraphStyle("Body", parent=base["Normal"], fontName=FONT_NAME, fontSize=8.3, leading=10.8, textColor=PRIMARY),
        "small": ParagraphStyle("Small", parent=base["Normal"], fontName=FONT_NAME, fontSize=7.5, leading=9.6, textColor=PRIMARY),
        "small_white": ParagraphStyle("SmallWhite", parent=base["Normal"], fontName=FONT_NAME, fontSize=7.5, leading=9.6, textColor=colors.white, alignment=1),
        "small_center": ParagraphStyle("SmallCenter", parent=base["Normal"], fontName=FONT_NAME, fontSize=7.5, leading=9.6, textColor=PRIMARY, alignment=1),
        "small_muted": ParagraphStyle("SmallMuted", parent=base["Normal"], fontName=FONT_NAME, fontSize=7.3, leading=9.3, textColor=MUTED),
    }


S = styles()


def table_style(header=True, align_right_cols=None):
    align_right_cols = align_right_cols or []
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), TABLE_RED),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    for col in align_right_cols:
        commands.append(("ALIGN", (col, 1), (col, -1), "RIGHT"))
    return TableStyle(commands)


def image_from_value(value, width=19 * mm, height=13 * mm):
    if not value:
        return p("-", S["small_center"])
    try:
        if isinstance(value, dict):
            source = value.get("source") or value.get("path") or ""
        else:
            source = str(value)
        if source.startswith("data:image/"):
            encoded = source.split(",", 1)[1]
            image_source = io.BytesIO(base64.b64decode(encoded))
        elif source and Path(source).exists():
            image_source = source
        else:
            return p("-", S["small_center"])
        img = Image(image_source, width=width, height=height)
        img.hAlign = "CENTER"
        return img
    except Exception:
        return p("-", S["small_center"])


def cell_value(value, style):
    if isinstance(value, dict) and value.get("type") == "image":
        return image_from_value(value)
    return p(value, style)


def info_table(left_title, left_rows, right_title, right_rows):
    def block(title, rows):
        content = [p(f"<b>{title}</b>", S["body"])]
        content.extend(p(f"{label}: {value}", S["small"]) for label, value in rows if value not in (None, ""))
        return content

    table = Table([[block(left_title, left_rows), block(right_title, right_rows)]], colWidths=[84 * mm, 84 * mm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def key_value_table(rows, cols=4, currency="$"):
    cells = []
    row = []
    for label, value in rows:
        rendered_value = money(value, currency) if isinstance(value, (int, float)) else value
        row.append(p(f"<b>{label}</b><br/>{rendered_value}", S["small"]))
        if len(row) == cols:
            cells.append(row)
            row = []
    if row:
        row.extend([""] * (cols - len(row)))
        cells.append(row)
    table = Table(cells, colWidths=[42 * mm] * cols)
    table.setStyle(table_style(header=False))
    return table


def product_table(columns, rows, widths, money_cols=None, currency="$"):
    money_cols = money_cols or []
    data = [[p(label, S["small_white"]) for label in columns]]
    row_styles = []
    for row in rows:
        rendered = []
        for index, key in enumerate(row["_keys"]):
            value = row.get(key, "")
            style = S["small_center"] if key in ("no", "quantity", "logoImage") else S["small"]
            rendered.append(cell_value(money(value, currency) if index in money_cols else value, style))
        data.append(rendered)
        if row.get("_summary"):
            row_styles.append(("BACKGROUND", (0, len(data) - 1), (-1, len(data) - 1), SOFT_RED))
    table = Table(data, colWidths=widths, repeatRows=1)
    style = table_style(header=True, align_right_cols=money_cols)
    for command in row_styles:
        style.add(*command)
    table.setStyle(style)
    return table


def summary_table(items):
    labels = [p(item.get("label", ""), S["small_white"]) for item in items]
    values = [p(item.get("value", ""), S["small_center"]) for item in items]
    table = Table([labels, values], colWidths=[168 * mm / max(len(items), 1)] * len(items))
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("BACKGROUND", (0, 1), (-1, 1), SUMMARY_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def logo_flowable(path):
    if not path or not Path(path).exists():
        return ""
    try:
        image = Image(path, width=38 * mm, height=16 * mm)
        image.hAlign = "RIGHT"
        return image
    except Exception:
        return ""


def header(title, subtitle, logo_path):
    logo = logo_flowable(logo_path)
    right = [p(title, S["title"])]
    right.extend(p(line, S["sub"]) for line in str(subtitle or "").split("\n") if line)
    table = Table([[logo, right]], colWidths=[70 * mm, 98 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def build_structured_document(doc_payload, logo_path):
    flow = [header(doc_payload.get("title", "订单文件"), doc_payload.get("subtitle", ""), logo_path), Spacer(1, 8)]
    currency = doc_payload.get("currencySymbol", "$")

    info = doc_payload.get("info")
    if info:
        flow.append(info_table(info.get("leftTitle", ""), info.get("leftRows", []), info.get("rightTitle", ""), info.get("rightRows", [])))
        flow.append(Spacer(1, 8))

    terms = doc_payload.get("terms", [])
    if terms:
        flow.append(key_value_table(terms, currency=currency))
        flow.append(Spacer(1, 8))

    summary = doc_payload.get("summary", [])
    if summary:
        flow.append(summary_table(summary))
        flow.append(Spacer(1, 8))

    for section in doc_payload.get("sections", []):
        flow.append(p(section.get("title", ""), S["h2"]))
        kind = section.get("kind")
        if kind == "table":
            flow.append(product_table(section["columns"], section["rows"], [w * mm for w in section["widths"]], section.get("moneyCols", []), section.get("currencySymbol", currency)))
        elif kind == "summary":
            flow.append(summary_table(section.get("items", [])))
        elif kind == "kv":
            flow.append(key_value_table(section.get("rows", []), section.get("cols", 4), section.get("currencySymbol", currency)))
        else:
            flow.extend(p(line, S["body"]) for line in section.get("lines", []))
        flow.append(Spacer(1, 7))

    notes = doc_payload.get("notes", [])
    if notes:
        flow.append(p("备注 / Notes", S["h2"]))
        for note in notes:
            flow.append(p(note, S["small_muted"]))
    return flow


def build_legacy(title, lines, logo_path):
    flow = [header(title, "", logo_path), Spacer(1, 8)]
    for line in lines:
        flow.append(p(line, S["body"]))
    return flow


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT_NAME, 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "WDER Fitness Equipment")
    canvas.drawRightString(PAGE_WIDTH - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def main():
    payload = json.loads(sys.stdin.read())
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=payload.get("title", "订单 PDF"),
    )
    logo_path = payload.get("logoPath", "")
    if payload.get("document"):
        flow = build_structured_document(payload["document"], logo_path)
    else:
        flow = build_legacy(payload.get("title", "订单 PDF"), payload.get("lines", []), logo_path)
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
