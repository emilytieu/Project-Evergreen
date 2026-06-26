import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
      {/* ── Global styles pulled in once here ── */}
      {/* If you already import a global CSS in main.jsx, remove this */}
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f0eee7; }
      `}</style>

      {/* Nav — uses React Router <Link> so clicks don't reload the page */}
      <nav style={styles.nav}>
        <span style={styles.logo}>Project Evergreen</span>
        <div style={styles.navLinks}>
          <Link to="/"          style={styles.navLink}>Home</Link>
          <Link to="/builder"   style={styles.navLink}>System Builder</Link>
          <Link to="/predictor" style={styles.navLink}>H₂ Predictor</Link>
          <Link to="/explorer"  style={styles.navLink}>Component Explorer</Link>
        </div>
      </nav>

      {/*
        ── Your existing homepage content goes here ──
        You can paste the <header>, <div class="section">, <div class="container">
        blocks from your original index.html directly below this comment,
        converting class= to className= (React requirement).

        Example:
      */}
      <header style={styles.hero}>
        <h1 style={styles.h1}>What is <em>Green Hydrogen?</em></h1>
        <p style={styles.heroP}>
          Green hydrogen is produced by using renewable electricity to split water
          into hydrogen and oxygen through electrolysis — with zero carbon emissions.
        </p>
        <div style={styles.heroBtns}>
          <Link to="/builder"   style={styles.btnPrimary}>Build a System →</Link>
          <Link to="/predictor" style={styles.btnGhost}>Predict Output</Link>
        </div>
      </header>

      {/* Add your Key Benefits, How It's Produced, Technology sections here */}
    </>
  );
}

// Inline styles match your beige/blue theme — move to a CSS file if preferred
const styles = {
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(240,238,231,0.92)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(0,0,0,0.09)",
    padding: "0 28px",
    height: 52,
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  logo: {
    fontFamily: "'Lora', Georgia, serif",
    fontSize: 15,
    fontWeight: 600,
    color: "#1a4a5e",
  },
  navLinks: { display: "flex", gap: 4 },
  navLink: {
    color: "#5a5650",
    fontSize: 13,
    textDecoration: "none",
    padding: "6px 12px",
    borderRadius: 5,
    transition: "background 0.15s",
  },
  hero: {
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    padding: "80px 40px",
    fontFamily: "'DM Sans', sans-serif",
  },
  h1: {
    fontFamily: "'Lora', Georgia, serif",
    fontSize: "clamp(2.4rem, 6vw, 4.5rem)",
    fontWeight: 300,
    color: "#1e1e1e",
    marginBottom: 20,
  },
  heroP: {
    fontSize: 16,
    color: "#5a5650",
    maxWidth: 540,
    lineHeight: 1.75,
    marginBottom: 36,
  },
  heroBtns: { display: "flex", gap: 12 },
  btnPrimary: {
    padding: "13px 28px",
    background: "#1a4a5e",
    color: "#fff",
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
  },
  btnGhost: {
    padding: "13px 28px",
    border: "1.5px solid rgba(44,95,122,0.35)",
    color: "#1a4a5e",
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 14,
  },
};