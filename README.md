DeltaForge
DeltaForge is a collaborative document editor built with the MERN
stack and real-time collaboration technologies. It is designed to let
multiple users work on shared documents, edit content together, and
maintain document versions.
Update the repository-specific paths, environment variables, and
scripts below if your local project uses different names.

Table of Contents
- Overview
- Features
- Technology Stack
- Project Structure
- Prerequisites
- Installation
- Environment Configuration
- Run the Application
- How to Use
- Word Import and Export
- Collaboration Flow
- Version History and Restore
- API Routes
- Testing Checklist
- Troubleshooting
- Security Notes
- Limitations and Future
  Improvements
Overview
DeltaForge provides a browser-based workspace for creating and editing
documents. It uses Tiptap as the rich-text editor and Yjs as the shared
document model. Socket.IO carries collaboration events between connected
clients, while MongoDB stores application data and document updates.
Redis-compatible Memurai is used for the Redis-backed collaboration
infrastructure.

Users can create documents in DeltaForge, collaborate with other
authorized users, import .docx files for editing, and export edited
content as .docx files.
Features
Document editing
- Create and edit documents in the browser.
- Rich-text editing with Tiptap.
- Bold, italic, underline and strikethrough formatting.
- Paragraphs and headings.
- Bullet and numbered lists.
- Blockquotes.
- Left, center and right text alignment.
- Text color.
- Hyperlinks.
- Tables.
- Image insertion by URL.
Real-time collaboration
- Shared document state using Yjs.
- Real-time collaboration events using Socket.IO.
- Active collaborator presence.
- Collaborative cursors using Tiptap Collaboration Caret.
- Edit permissions and read-only access for users without edit
  permission.
- IndexedDB persistence in the browser for local document state.
Document management
- Document creation and management.
- Document sharing and collaborator permissions, according to the
  configured application roles.
- MongoDB persistence for document updates.
- Version snapshots and version history.
- Restore a snapshot as a separate document, leaving the original
  document unchanged.
Microsoft Word support
- Import .docx files from the user's computer.
- Convert Word content to HTML using Mammoth.
- Sanitize imported HTML with DOMPurify before inserting it into the
  editor.
- Edit imported content inside DeltaForge.
- Export editor content as .docx using the backend html-to-docx
  package.
The import implementation currently accepts .docx files and has a 10
MB file-size limit in the editor.
Technology Stack
  Area                        Technology
  Frontend                    React, Vite
Rich-text editor            Tiptap
Real-time document model    Yjs
Collaboration transport     Socket.IO
Backend                     Node.js, Express
Database                    MongoDB, Mongoose
Redis-compatible service    Memurai / Redis
Authentication              JWT
Local browser persistence   IndexedDB
Word import                 Mammoth
HTML sanitization           DOMPurify
Word export                 html-to-docx
Icons                       lucide-react
Project Structure
The following is a representative structure based on the files used by
the application. Your repository may contain additional files and
folders.
DeltaForge/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── wordController.js
│   │   └── ...
│   ├── models/
│   │   └── ...
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── documentRoutes.js
│   │   ├── snapshotRoutes.js
│   │   └── wordRoutes.js
│   ├── services/
│   │   └── redisService.js
│   ├── sockets/
│   │   └── documentSocket.js
│   ├── utils/
│   │   └── wordExport.js
│   ├── .env
│   ├── package.json
│   └── server.js
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── axios.js
    │   ├── components/
    │   │   └── CollaborativeEditor.jsx
    │   ├── hooks/
    │   │   └── useCollaborativeDocument.js
    │   ├── utils/
    │   │   └── importWord.js
    │   └── ...
    ├── .env
    └── package.json
Prerequisites
Install or configure the following before running the application:
- Node.js (use a version supported by the installed dependencies).
- npm.
- MongoDB running locally or a reachable MongoDB deployment.
- Redis or Memurai running and reachable by the backend.
- A modern browser.
- Microsoft Word or another compatible application to open exported
  .docx files.
Installation
Clone the repository and open a terminal in the project directory.
git clone <your-repository-url>
cd DeltaForge
Install backend dependencies:
cd backend
npm install
Install frontend dependencies:
cd ../frontend
npm install
Word document dependencies
The frontend needs the packages used by the Word import and editor
features. Install any that are not already in the frontend
package.json:
npm install mammoth dompurify
npm install @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-color @tiptap/extension-text-style @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-image
The backend needs the DOCX export package:
cd ../backend
npm install html-to-docx
html-to-docx must run on the backend in this project. Do not import it
directly into the Vite browser application because it relies on Node.js
modules.
Environment Configuration
Create a .env file in the backend directory. The backend requires the
following environment variables:
PORT=5000
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://127.0.0.1:27017/deltaforge
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace_with_a_long_random_secret
Use the MongoDB connection string and database name appropriate for your
environment. If Memurai or Redis uses a different host or port, update
REDIS_URL.

Create a frontend .env file if you want to configure the API URL:
VITE_API_URL=http://localhost:5000/api
The frontend Axios instance uses this value as its API base URL and
otherwise defaults to http://localhost:5000/api.

Important: Do not commit real .env files, passwords, database
credentials, or JWT secrets to source control. Add them to .gitignore.
Run the Application
Start MongoDB and Redis/Memurai first.
Start the backend
Open a terminal:
cd backend
npm run dev
If your backend package.json does not define a dev script, use the
script configured in that file (for example, npm start or
node server.js).

The backend is configured to use port 5000 by default.

Check the health endpoint in a browser:
http://localhost:5000/health
A running backend should return application status and the MongoDB
connection status.
Start the frontend
Open a second terminal:
cd frontend
npm run dev
Open the Vite URL shown in the terminal. The default is:
http://localhost:5173
How to Use
1. Register or sign in.
2. Open the document workspace.
3. Create a new document or open a document shared with you.
4. Enter and format content in the editor.
5. Invite or share the document with other users using the
   application's sharing controls.
6. Open the same document in another authorized browser session to test
   collaboration.
7. Use version history to view saved snapshots.
8. Import a Word document or export the current document as a Word
   file.
The exact screens and available actions depend on the routes and UI
components present in your repository.
Word Import and Export
Import a Word document
1. Open a document in DeltaForge with edit permission.
2. Select Import Word.
3. Choose a .docx file from your computer.
4. Confirm replacement if the current document already contains
   content.
5. Wait for the import confirmation message.
6. Continue editing the imported content in DeltaForge.
The import utility converts DOCX content to HTML using Mammoth and
sanitizes the HTML using DOMPurify before inserting it into the Tiptap
editor.

Warning: Import replaces the current editor content after
confirmation. Make sure the existing document is saved or create a copy
before importing if you need to preserve it.
Export a Word document
1. Open the document in DeltaForge.
2. Make sure the editor contains the content you want to export.
3. Select Export Word.
4. The frontend sends the editor HTML to POST /api/word/export.
5. The backend generates a .docx file and returns it as a download.
6. Open the downloaded file in Microsoft Word.
The export package runs in Node.js on the backend, not in the browser.
Collaboration Flow
At a high level:
1. A user opens a document.
2. The frontend creates or loads the Yjs document associated with that
   document ID.
3. The collaboration hook connects to the backend using Socket.IO and
   the user's JWT.
4. The backend checks access and joins the user to the relevant
   collaboration session.
5. Yjs updates are exchanged between connected clients.
6. The backend persists document updates in MongoDB.
7. IndexedDB maintains a browser-side copy for local persistence.
The actual event names and persistence details are defined in the
project's collaboration hook and Socket.IO handlers.
Version History and Restore
DeltaForge supports document snapshots and a version-history view.
- Snapshots represent saved document states.
- The version-history screen displays available snapshots.
- Restoring a snapshot is intended to create a separate document with
  a restored title.
- The original document should remain unchanged.
After restoring, verify that the new document has a different document
ID and that the original still contains its previous content.
API Routes
The following routes are registered in the backend server configuration:

  Method   Route                Purpose
  GET      /                  API welcome/status response
GET      /health            Backend and MongoDB health status
/      /api/auth          Authentication routes
/      /api/documents     Document routes
/      /api/snapshots     Snapshot and version-history routes
POST     /api/word/export   Generate and download a Word document

Authentication and document route details are defined in their
respective route files.
Word export request
Endpoint:
POST /api/word/export
Request body:
{
  "html": "<h1>Project Notes</h1><p>Document content.</p>"
}
Successful response: a DOCX binary download with the content type:
application/vnd.openxmlformats-officedocument.wordprocessingml.document
The controller rejects missing or non-string HTML and limits the HTML
payload to 5 MB.
Testing Checklist
Use the application UI to test the main workflows.
Authentication and documents
- [ ] Register a user.
- [ ] Sign in and sign out.
- [ ] Create a document.
- [ ] Open an existing document.
- [ ] Verify that a user without edit permission has read-only access.
Collaboration
- [ ] Open the same shared document in two browser sessions.
- [ ] Edit text in the first session.
- [ ] Confirm that the second session receives the change.
- [ ] Check collaborator presence and cursors.
- [ ] Refresh both sessions and verify persisted content.
Word support
- [ ] Import a valid .docx file.
- [ ] Confirm that imported text appears in the editor.
- [ ] Test bold, italic, underline, headings and lists.
- [ ] Test alignment, links, tables and image insertion.
- [ ] Export the document.
- [ ] Open the exported .docx file in Microsoft Word.
- [ ] Verify that the exported content is present and editable.
Version history
- [ ] Create a snapshot.
- [ ] Create another snapshot after editing.
- [ ] Confirm that both snapshots appear in version history.
- [ ] Restore a snapshot as a new document.
- [ ] Verify that the original document remains unchanged.
Troubleshooting
Redis connection refused
Example:
Redis Publisher Error: connect ECONNREFUSED 127.0.0.1:6379
Possible cause: Redis/Memurai is stopped or the configured host/port is
incorrect.

Checks:
1. Open Windows Services (services.msc).
2. Find Memurai and start it if stopped.
3. Check whether port 6379 is listening:
netstat -ano | findstr :6379
4. Verify REDIS_URL in the backend .env.
5. Restart the backend.
Vite reports a Node.js module externalization error for html-to-docx
Do not import html-to-docx in frontend React code. Keep it in the
backend utility and call the backend export endpoint through Axios.
DOCX file downloads but Microsoft Word cannot open it
1. Check the backend terminal for Word export error.
2. Confirm that the backend is using the current wordExport.js.
3. Confirm the export options include numeric values for all page
   margins: top, right, bottom, left, header, footer, and
   gutter.
4. Download a fresh file after restarting the backend.
5. Test the new file in Microsoft Word.
A ZIP signature check alone does not prove that a DOCX archive is
structurally valid.
Frontend cannot reach the backend
1. Confirm the backend is running on port 5000.
2. Check VITE_API_URL.
3. Confirm CLIENT_URL matches the frontend origin.
4. Restart Vite after changing frontend environment variables.
MongoDB connection fails
1. Confirm MongoDB is running.
2. Check MONGO_URI.
3. Review the backend terminal for the connection error.
4. Restart the backend after correcting the configuration.
Security Notes
- Keep JWT secrets and database credentials out of source control.
- Protect document and export routes with the application's
  authentication and authorization middleware.
- Verify that the requesting user has access to the document before
  exporting or modifying it.
- Sanitize imported HTML before inserting it into the editor.
- Validate and restrict uploaded file types and sizes.
- Treat imported document content and externally supplied image URLs
  as untrusted input.
- Apply appropriate rate limits and request-size limits to production
  endpoints.
Limitations and Future Improvements
The current Word workflow provides basic DOCX import and export.
Microsoft Word has features that are not automatically reproduced by a
browser-based editor or a basic HTML-to-DOCX conversion.

Potential improvements include:
- Local image upload and managed image storage.
- More complete DOCX formatting preservation.
- Headers, footers and page numbers.
- Page breaks and page-layout controls.
- More advanced table formatting.
- Export to PDF.
- More detailed version comparison and restore previews.
- Automated integration tests for collaboration and document
  conversion.
