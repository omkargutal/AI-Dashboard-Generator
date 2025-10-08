import DashboardGenerator from "./components/DashboardGenerator";

export default function App() {
  return (
    <div style={{
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: 18,
      background: '#0f1724',
      color: '#e6eef8',
      minHeight: '100vh',
      width: '100%'
    }}>
      <div style={{ width: '100%' }}>
        <h1 style={{ marginBottom: 12, fontSize: 28 }}>AI Data Dashboard</h1>
        <DashboardGenerator />
      </div>
    </div>
  );
}
