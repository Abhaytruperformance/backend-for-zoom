import React, { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

type NavItem = { label: string; href: string; subItems: { label: string; href: string }[] };

export default function MobileNavigation({ navItems }: { navItems: NavItem[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMobileOpen(false);
    };
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [mobileOpen]);

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="inline-flex w-5 h-5 items-center justify-center rounded-full text-white transition hover:bg-white/20 sm:hidden"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 sm:hidden" onClick={() => setMobileOpen(false)} />}

      <div ref={menuRef} className={`${mobileOpen ? "block" : "hidden"} sm:hidden absolute right-0 top-full mt-3 z-50`}>
        <div className="w-[200px] mx-auto rounded-2xl bg-black p-4 shadow-lg">
          <ul className="space-y-2 text-sm font-medium text-white/80">
            {navItems.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="block rounded-xl px-3 py-2 text-white hover:bg-white/10">
                  {item.label}
                </a>
              </li>
            ))}
            <Link to="/login">
              <button className="w-full rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 mt-2">Log in</button>
            </Link>
          </ul>
        </div>
      </div>
    </>
  );
}
