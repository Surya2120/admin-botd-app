const sections = [
  { id: "season", label: "Season" },
  { id: "categories", label: "Categories" },
  { id: "contestants", label: "Contestants & Judges" },
  { id: "events", label: "Events" },
  { id: "voting", label: "Voting" },
  { id: "sponsors", label: "Sponsors" },
  { id: "rules", label: "Rules" },
  { id: "data", label: "Data Hub" },
  { id: "activity", label: "Activity Log" }
];

export function Sidebar({ activeSection, onChange, onLogout }) {
  return (
    <aside className="sidebar">
      <div>
        <p className="eyebrow">Battle Of The Dance</p>
        <h2 className="sidebar-title">Admin Panel</h2>
      </div>
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`sidebar-link ${activeSection === section.id ? "is-active" : ""}`}
            onClick={() => onChange(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <button type="button" className="ghost-button" onClick={onLogout}>
        Logout
      </button>
    </aside>
  );
}
