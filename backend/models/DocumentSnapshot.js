import mongoose from "mongoose";

const documentSnapshotSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    label: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Saved version",
    },

    state: {
      type: Buffer,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

documentSnapshotSchema.index({
  document: 1,
  createdAt: -1,
});

const DocumentSnapshot = mongoose.model(
  "DocumentSnapshot",
  documentSnapshotSchema
);

export default DocumentSnapshot;