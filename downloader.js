// To be used as a bookmarklet or similar.
// For sites using pspdfkit to prevent PDF downloads. This script 
// requests each page as an image and bundles those into a pdf.
// I think it works for next.js+pspdfkit websites. May have something
// to do with React, not sure, it looks for a "#__NEXT_DATA__" block.
// One such website is the "boom voortgezet onderwijs" website.
// If nothing happens when running this, try reloading the page,
// otherwise the next.js data may be incomplete.

(async function () {
  if (typeof jsPDF === 'undefined') {
    const el = document.createElement('script');
    el.setAttribute(
      'src',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
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
  div.style.zIndex = '10000';

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

  if (title != JSON.parse(document.getElementById('Book').innerHTML).name) {
    alert('Outdated book properties found, please reload the page.');

    // remove progress indicator
    document.body.removeChild(div);
    return;
  }

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
  const default_width = 900;
  let desired_width = prompt('Enter desired resolution of pages (width, in pixels):', default_width);
  desired_width = parseInt(desired_width);
  if (isNaN(desired_width) || desired_width <= 0) desired_width = default_width;
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
    const pdf = new jsPDF({
      orientation: aspect_ratio > 1 ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [desired_width, desired_height]
    });
    console.log(`Downloading ${number_of_pages} pages...`);
    updateStatus('Downloading...');

    const batch_size = 15;
    
    for (let i = 0; i < number_of_pages; i += batch_size) {
      const promises = [];
      const endIndex = Math.min(i + batch_size, number_of_pages);
      
      for (let j = i; j < endIndex; j++) {
        promises.push(downloadPage(j));
      }

      const results = await Promise.all(promises);
      
      // once batch is downloaded, add to pdf one by one
      for (let j = 0; j < results.length; j++) {
        const pageIndex = i + j;
        
        if (pageIndex > 0) {
          pdf.addPage([desired_width, desired_height]);
        }
        
        pdf.addImage(
          results[j], 
          'WEBP', 
          0, 
          0, 
          desired_width, 
          desired_height
        );
        
        URL.revokeObjectURL(results[j]);
      }
      
      updateProgress(((i + batch_size) / number_of_pages) * 100);
    }

    updateStatus('Creating PDF...');
    
    // remove progress indicator
    document.body.removeChild(div);

    // download pdf
    pdf.save(`${title}.pdf`);
  }

  async function downloadPage(pageIndex) {
    const blob = await get_page_blob(pageIndex);
    return URL.createObjectURL(blob);
  }

  let jspdf_checker = setInterval(async () => {
    if (typeof window.jspdf !== 'undefined') {
      jsPDF = window.jspdf.jsPDF;
      clearInterval(jspdf_checker);
      await main();
    }
  }, 1000);
})();
