import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorReporter } from "@/components/GlobalErrorBoundary";

installGlobalErrorReporter();
createRoot(document.getElementById("root")!).render(<App />);
