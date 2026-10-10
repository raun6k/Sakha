import { CONTRACT_VERSION } from "@sakha/contracts";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <main data-contract={CONTRACT_VERSION}>
      <h1>Sakha</h1>
      <p>
        Workspace foundation. Farm setup and services are being implemented.
      </p>
    </main>,
  );
