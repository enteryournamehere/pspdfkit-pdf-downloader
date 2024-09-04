For sites using pspdfkit to prevent PDF downloads. This script
fetches each page as an image and bundles those into a zip.

You can then turn that into a PDF using [IrfanView](https://brianmahoney.ca/2011/09/create-pdf-files-using-irfanview-free-is-good/), or with [ImageMagick](https://imagemagick.org/) via `convert *.webp book.pdf`.

You may want to edit the desired_width variable to get a
higher resolution - at the cost of an increased filesize.

To be used as a bookmarklet or similar. If nothing happens
when running this, try reloading the page, otherwise the
next.js data may be incomplete.

I think it works for `next.js`+`pspdfkit` websites. May have
something to do with React, not sure, it looks for a
`#__NEXT_DATA__` block. These websites are known to be supported:
- Boom Digitaal: https://e-book.boomdigitaal.nl/
- probably more... If the PDF viewer looks like this,
give it a try, and let me know if it doesn't work by creating
an issue here on github.
![image](https://github.com/user-attachments/assets/1809defc-5616-4468-be57-38ecf4254114)
