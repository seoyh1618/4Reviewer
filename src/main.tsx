import React from "react";
import ReactDOM from "react-dom/client";
import "./assets/fonts/pretendard/pretendardvariable-dynamic-subset.css";
import "./styles.css";
import "./workspace.css";
import "./auth-mobile.css";
import App from "./App";
import { PwaProvider } from "./PwaInstall";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PwaProvider>
      <App />
    </PwaProvider>
  </React.StrictMode>,
);
