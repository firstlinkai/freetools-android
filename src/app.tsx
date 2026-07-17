import { HashRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./shell/dashboard";
import { ToolScreen } from "./shell/tool-screen";

/**
 * Hash routing keeps every navigation inside a single local document — no
 * server, no history API edge cases inside the Android WebView asset origin.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tools/:slug" element={<ToolScreen />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  );
}
