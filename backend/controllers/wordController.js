import { generateWordDocument } from "../utils/wordExport.js";

export const exportWordDocument = async (req, res) => {
  try {
    const { html } = req.body;

    if (!html || typeof html !== "string") {
      return res.status(400).json({
        message: "Document HTML is required.",
      });
    }

    if (html.length > 5 * 1024 * 1024) {
      return res.status(413).json({
        message: "Document is too large to export.",
      });
    }

    const buffer = await generateWordDocument(html);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="deltaforge-document.docx"'
    );

    res.setHeader("Content-Length", buffer.length);

return res.end(buffer);
  } catch (error) {
    console.error("Word export error:", error);

    return res.status(500).json({
      message: "Failed to export Word document.",
    });
  }
};