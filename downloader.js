// To be used as a bookmarklet or similar.
// For sites using pspdfkit to prevent PDF downloads. This script 
// requests each page as an image and bundles those into a zip.
// I think it works for next.js+pspdfkit websites. May have something
// to do with React, not sure, it looks for a "#__NEXT_DATA__" block.
// One such website is the "boom voortgezet onderwijs" website.
// You may want to edit the desired_width variable to get a higher 
// resolution - at the cost of an increased filesize.
// If nothing happens when running this, try reloading the page,
// otherwise the next.js data may be incomplete.

(async function () {
  if (typeof JSZip === 'undefined') {
    const el = document.createElement('script');
    el.setAttribute(
      'src',
      'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js'
    );
    document.body.append(el);
  }

  function buildUrl(...parts) {
    return parts
      .join('/')
      .replaceAll('//', '/')
      .replaceAll('//', '/')
      .replace(':/', '://');
  }

  function get_book_properties() {
    const info_script = document.querySelector('#__NEXT_DATA__');
    if (!info_script) {
      throw new Error('Could not find book properties');
    }
    const parsed = JSON.parse(info_script.innerHTML);
    return {
      base_url: parsed.runtimeConfig.pspdfkit + 'i/d/',
      jwt: parsed.props.pageProps.book.viewerToken,
      isbn: parsed.props.pageProps.book.id,
      title: parsed.props.pageProps.book.metadata.title,
    };
  }

  // Progress indicator
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0px';
  div.style.left = '0px';
  div.style.width = '600px';
  div.style.height = '100px';
  div.style.background = 'rgb(96, 96, 96)';
  div.style.fontSize = '50px';
  div.style.color = 'white';
  div.style.padding = '10px';

  document.body.appendChild(div);

  function updateProgress(percent) {
    percent = Math.max(0, Math.min(100, percent));
    const width = (percent / 100) * parseInt(div.style.width);
    div.style.background =
      'linear-gradient(to right, rgb(63, 179, 157) ' +
      width +
      'px, rgb(96, 96, 96) ' +
      width +
      'px)';
  }

  function updateStatus(text) {
    div.innerText = text;
  }

  updateStatus('Reading properties...');
  const { base_url, jwt, isbn, title } = get_book_properties();

  updateStatus('Authenticating...');
  /// AUTH
  let auth_request = await fetch(buildUrl(base_url, isbn, '/auth'), {
    credentials: 'include',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en,sv;q=0.5',
      'Content-Type': 'application/json',
      'PSPDFKit-Platform': 'web',
      'PSPDFKit-Version': 'protocol=3, client=2020.2.6, client-git=03f442dc42',
      'Sec-GPC': '1',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
    referrer: base_url,
    body: JSON.stringify({
      jwt: jwt,
      origin: document.location.href,
    }),
    method: 'POST',
    mode: 'cors',
  });

  let auth_response = await auth_request.json();
  let pdfkit_token = auth_response.token;
  let layer_handle = auth_response.layerHandle;
  let image_token = auth_response.imageToken;

  updateStatus('Getting book info...');

  /// DOCUMENT INFO
  let document_request = await fetch(
    buildUrl(base_url, isbn, 'h', layer_handle, '/document.json'),
    {
      credentials: 'omit',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'en,sv;q=0.5',
        'X-PSPDFKit-Token': pdfkit_token,
        'PSPDFKit-Platform': 'web',
        'PSPDFKit-Version':
          'protocol=3, client=2020.2.6, client-git=03f442dc42',
        'Sec-GPC': '1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      referrer: base_url,
      method: 'GET',
      mode: 'cors',
    }
  );
  const document_response = await document_request.json();
  const number_of_pages = document_response.data.pageCount;
  const aspect_ratio =
    document_response.data.pages[0].width /
    document_response.data.pages[0].height;
  const desired_width = 650;
  const desired_height = Math.round(desired_width / aspect_ratio);

  function generate_image_url(page, width, height) {
    return buildUrl(
      base_url,
      isbn,
      'h',
      layer_handle,
      '/page-' +
        page.toString() +
        '-dimensions-' +
        width.toString() +
        '-' +
        height.toString() +
        '-tile-0-0-' +
        width.toString() +
        '-' +
        height.toString()
    );
  }

  async function get_page_blob(page_number) {
    const url = generate_image_url(page_number, desired_width, desired_height);
    data = await fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'image/webp',
        'X-Pspdfkit-Image-Token': image_token,
      },
      method: 'GET',
      mode: 'cors',
    });
    x = await data.blob();
    return x;
  }

  async function main() {
    const zip = new JSZip();

    console.log(`Downloading ${number_of_pages} pages...`);

    updateStatus('Downloading...');

    const batch_size = 10;

    for (let i = 0; i < number_of_pages; i += batch_size) {
      const promises = [];
      for (let j = i; j < number_of_pages && j < i + batch_size; j++) {
        promises.push(getAndAddBlobToZip(zip, j));
      }
      await Promise.all(promises);
      updateProgress(((i + batch_size) / number_of_pages) * 100);
    }

    updateStatus('Creating zip...');
    const content = await zip.generateAsync({ type: 'blob' });

    // remove progress indicator
    document.body.removeChild(div);

    // download zip
    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(content);
    downloadLink.download = `${title}.zip`;
    downloadLink.click();
  }

  async function getAndAddBlobToZip(zip, pageIndex) {
    const blob = await get_page_blob(pageIndex);
    zip.file(`page-${pageIndex.toString().padStart(4, '0')}.webp`, blob);
  }

  let jszip_checker = setInterval(async () => {
    if (typeof JSZip !== 'undefined') {
      clearInterval(jszip_checker);
      await main();
    }
  }, 1000);
})();
