
import HTMLtoDOCX from "html-to-docx";

export async function generateWordDocument(html) {
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
          }

          table {
            border-collapse: collapse;
            width: 100%;
          }

          td, th {
            border: 1px solid #000;
            padding: 6px;
          }

          img {
            max-width: 100%;
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;

  const result = await HTMLtoDOCX(fullHtml, null, {
    title: "DeltaForge Document",
    subject: "Document exported from DeltaForge",
    creator: "DeltaForge",

    pageSize: {
      width: 11906,
      height: 16838,
    },

    margins: {
      top: 1440,
      right: 1440,
      bottom: 1440,
      left: 1440,
      header: 720,
      footer: 720,
      gutter: 0,
    },
  });

  const buffer = Buffer.isBuffer(result)
    ? result
    : Buffer.from(result);

  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b
  ) {
    throw new Error("Invalid DOCX file generated.");
  }

  console.log(
    "DOCX generated successfully:",
    buffer.length,
    "bytes"
  );

  return buffer;
}
