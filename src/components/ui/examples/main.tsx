import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ExamplesPage from "./ExamplesPage";
import "/src/index.css";

// US-56: entry of the dev-only examples.html (http://localhost:3000/examples.html with `npm run dev`).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExamplesPage />
  </StrictMode>
);
