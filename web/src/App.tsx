import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Ledger from "./pages/Ledger";
import { isConfigured } from "./config";

export default function App() {
  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl border border-line bg-paper p-5 text-sm">
          <p className="font-semibold text-dark">Contract address not set</p>
          <p className="mt-2">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in <code>VITE_VAULT_ADDRESS</code> and{" "}
            <code>VITE_TOKEN_ADDRESS</code>, then restart <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/ledger/:id" element={<Ledger />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
