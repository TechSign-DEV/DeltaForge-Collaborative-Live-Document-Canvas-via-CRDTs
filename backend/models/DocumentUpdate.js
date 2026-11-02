import mongoose from "mongoose";

const documentUpdateSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },

    update: {
      type: Buffer,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Efficiently retrieve updates for a document in chronological order.
documentUpdateSchema.index({
  document: 1,
  createdAt: 1,
  _id: 1,
});

const DocumentUpdate = mongoose.model(
  "DocumentUpdate",
  documentUpdateSchema
);

export default DocumentUpdate;