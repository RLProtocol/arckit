import { Routes, Route, Link } from "react-router-dom";
import { Nav } from "@/components/Nav";
import { NetworkBanner } from "@/components/NetworkBanner";
import { TestBanner } from "@/components/TestBanner";
import { Home } from "@/pages/Home";
import { NewLock } from "@/pages/NewLock";
import { LockDetail } from "@/pages/LockDetail";
import { TokenPage } from "@/pages/TokenPage";
import { MyLocks } from "@/pages/MyLocks";
import { Explore } from "@/pages/Explore";
import { NewVesting } from "@/pages/NewVesting";
import { VestingDetail } from "@/pages/VestingDetail";
import { Airdrop } from "@/pages/Airdrop";
import { Flow } from "@/pages/Flow";
import { Stake } from "@/pages/Stake";
import { Pay } from "@/pages/Pay";
import { Cash } from "@/pages/Cash";
import { Docs } from "@/pages/Docs";
import { Lend } from "@/pages/Lend";
import { P2P } from "@/pages/P2P";
import { FlowPosition, FlowLocks } from "@/pages/FlowPosition";
import { Footer } from "@/components/Footer";

export default function App() {
  return (
    <>
      <Nav />
      <TestBanner />
      <NetworkBanner />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lock/new" element={<NewLock />} />
          <Route path="/lock/:id" element={<LockDetail />} />
          <Route path="/vest/new" element={<NewVesting />} />
          <Route path="/vest/:id" element={<VestingDetail />} />
          <Route path="/airdrop" element={<Airdrop />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="/cash" element={<Cash />} />
          <Route path="/lend" element={<Lend />} />
          <Route path="/p2p" element={<P2P />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/flow" element={<Flow />} />
          <Route path="/flow/locks" element={<FlowLocks />} />
          <Route path="/flow/position/:id" element={<FlowPosition />} />
          <Route path="/stake" element={<Stake />} />
          <Route path="/stake/token/:token" element={<Stake />} />
          <Route path="/stake/:id" element={<Stake />} />
          <Route path="/token/:address" element={<TokenPage />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/my" element={<MyLocks />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

function NotFound() {
  return (
    <div className="wrap page">
      <div className="empty">
        <h2 style={{ marginBottom: 8 }}>Nothing here</h2>
        <p>That page does not exist.</p>
        <p style={{ marginTop: 16 }}>
          <Link className="btn btn-ghost" to="/">Back to ArcLock</Link>
        </p>
      </div>
    </div>
  );
}
