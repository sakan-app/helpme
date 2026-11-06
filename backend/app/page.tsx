export default function BackendHome() {
  return <main style={{ maxWidth: 760, margin: "12vh auto", padding: 24 }}>
    <p style={{ color: "#c5a880", letterSpacing: ".2em" }}>HELPMEY · EVERYDAY STORE</p>
    <h1 style={{ fontFamily: "Georgia, serif", fontSize: 42 }}>Account services</h1>
    <p>Helpmey authentication API is deployed. Account creation, login and recovery are available through the documented API routes once Supabase environment settings are configured.</p>
    <p style={{ color: "#c5a880" }}>This service does not process payments on its own.</p>
  </main>;
}