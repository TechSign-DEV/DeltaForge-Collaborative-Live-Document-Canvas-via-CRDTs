
import mongoose from "mongoose";

const collaboratorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["editor", "viewer"],
      default: "viewer",
    },
  },
  {
    _id: false,
  }
);

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      default: "Untitled Document",
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    collaborators: {
      type: [collaboratorSchema],
      default: [],
      validate: {
        validator: function (collaborators) {
          const userIds = collaborators.map((item) =>
            item.user.toString()
          );

          // Prevent duplicate collaborators.
          if (new Set(userIds).size !== userIds.length) {
            return false;
          }

          // Prevent owner from being their own collaborator.
          return !userIds.includes(this.owner?.toString());
        },
        message:
          "Collaborators must be unique and cannot include the document owner.",
      },
    },
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model("Document", documentSchema);

export default Document;
