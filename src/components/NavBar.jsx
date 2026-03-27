import { NavLink } from 'react-router-dom';

export default function NavBar() {
  const linkClass = ({ isActive }) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-slate-400 hover:text-white hover:bg-slate-700'
    }`;

  return (
    <nav className="bg-slate-800 border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-2">
        <span className="text-white font-bold text-lg mr-6">Schedule Viewer</span>
        <NavLink to="/" className={linkClass} end>Analytics</NavLink>
        <NavLink to="/scheduler" className={linkClass}>Scheduler</NavLink>
      </div>
    </nav>
  );
}
