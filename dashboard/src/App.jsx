import React from "react";
import LogViewer from "./components/LogViewer";
import ModelStats from "./components/ModelStats";
import Charts from "./components/Charts";
import Settings from "./components/Settings";

export default function App() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Toxic Content Detection Dashboard</h1>
      <ModelStats />
      <Charts />
      <LogViewer />
      <Settings />
    </div>
  );
}
