# Visual review evidence

Full-resolution browser captures are retained in the local production workspace.
They are excluded from Git to keep source synchronization practical; historical
review records preserve their exact capture paths and context. This does not
remove them from disk. Current compact `contact-sheet.jpg` overviews are tracked.

The downloadable templates are fully self-contained and do not depend on these
internal captures. Their original distributable images remain tracked under each
template's `public/assets/`. QA reports, reference maps and accepted/rejected
decisions remain in the repository. New audits can regenerate implementation
captures from the checked-in source at the documented viewport and scroll offsets.
