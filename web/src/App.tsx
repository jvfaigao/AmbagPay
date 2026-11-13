import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Ledger from "./pages/Ledger";
import Pay from "./pages/Pay";
import Officer from "./pages/Officer";
import { isConfigured } from "./config";

export default function App() {
  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-[20px] bg-paper p-5 text-sm shadow-card">
          <p className="font-semibold text-dark">App not configured</p>
          <p className="mt-2">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in <code>VITE_VAULT_ADDRESS</code>,{" "}
            <code>VITE_TOKEN_ADDRESS</code> and <code>VITE_PRIVY_APP_ID</code>, then restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/ledger/:id" element={<Ledger />} />
      <Route path="/pay/:id" element={<Pay />} />
      <Route path="/officer" element={<Officer />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
