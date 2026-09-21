import { Link } from "react-router-dom";
import MobileNavigation from "./MobileNavigation.js";

const navItems: { label: string; href: string; subItems: { label: string; href: string }[] }[] = [
  { label: "Pricing", href: "#pricing", subItems: [] },
  { label: "Docs", href: "/docs", subItems: [] },
];

export default function Navigation() {
  return (
    <div className="relative z-20 mx-auto w-full px-8 sm:px-8 lg:px-8 pt-4">
      <div className="w-full mx-0 md:mx-auto md:max-w-[900px] justify-between max-h-[58px] h-full rounded-full bg-[#0D0D0D] px-[16px] py-[10px] sm:px-[38px] sm:py-[12px]">
        <div className="relative flex items-center gap-0 justify-between">
          <img src="/lp/tru-dark.svg" alt="Tru Performance" className="h-8 w-auto hidden md:block" />
          <img src="/lp/logoMobile.svg" alt="Tru Performance" className="h-[22px] max-w-[148px] md:hidden" />

          <div className="hidden flex-1 justify-center sm:flex">
            <nav className="flex flex-wrap items-center justify-center gap-2 md:gap-3 lg:gap-4 text-sm font-medium text-white font-outfit">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="border border-transparent rounded-full px-2.5 md:px-3 lg:px-3.5 py-1.5 transition hover:bg-[#313131] hover:border-[#FFFFFF0D] hover:text-white text-xs md:text-sm lg:text-sm"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <Link to="/login">
            <button className="hidden rounded-full bg-white px-4 md:px-5 lg:px-6 py-2 text-xs md:text-sm lg:text-sm font-semibold text-black transition hover:bg-[#313131] hover:text-white sm:inline-flex">
              Log in
            </button>
          </Link>

          <MobileNavigation navItems={navItems} />
        </div>
      </div>
    </div>
  );
}
