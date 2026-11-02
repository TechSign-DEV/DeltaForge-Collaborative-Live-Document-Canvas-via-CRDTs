import mammoth from "mammoth";
import DOMPurify from "dompurify";

export async function importWordFile(file) {
  if (!file) {
    throw new Error("Please select a Word document.");
  }

  const isWordFile =
    file.name.toLowerCase().endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!isWordFile) {
    throw new Error("Only .docx Word documents are supported.");
  }

  const arrayBuffer = await file.arrayBuffer();

  const result = await mammoth.convertToHtml({
    arrayBuffer,
  });

  const cleanHtml = DOMPurify.sanitize(result.value, {
    USE_PROFILES: { html: true },
  });

  if (!cleanHtml.trim()) {
    throw new Error("No readable content found in this Word document.");
  }

  return {
    html: cleanHtml,
    messages: result.messages,
  };
}