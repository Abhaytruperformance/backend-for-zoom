import { Link } from "react-router-dom";
import { Separator } from "../ui/separator.js";

export default function Footer() {
  return (
    <footer className="lg:bg-[url('/lp/footerbg.webp')] bg-[url('/lp/footermobBg.webp')] bg-cover bg-center bg-no-repeat lg:max-h-[655px] lg:mx-auto">
      <div className="mx-auto container max-w-[1200px] w-full px-8 lg:px-0">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-5">
          <div className="col-span-2 md:col-span-2 lg:col-span-2 md:border-r md:border-b border-white">
            <img src="/lp/Tru_Web_Black.svg" alt="Tru Performance" className="w-auto h-[27.40px] md:mt-[50px] mt-[40px]" />
            <p className="w-full md:w-[417px] text-[#262626] lg:text-[14px] text-[12px] font-medium font-inter leading-[21px] md:mt-[8px] mt-[12px] mb-6 md:mb-[31.31px]">
              Built on Tru Performance's internal meeting-intelligence framework, now available as a standalone app to turn every Zoom meeting into a reliable record of what was decided.
            </p>
            <a
              href="mailto:sales@truperformance.us"
              className="group relative flex items-center gap-[10px] justify-between h-[45px] px-6 rounded-full overflow-hidden bg-[#FF5A24] text-white md:bg-transparent md:text-black text-[16px] font-[500] sm:w-auto"
            >
              <span className="absolute left-0 top-0 h-full md:duration-500 w-[45px] bg-[#FF5A24] rounded-full transition-all ease-in-out md:group-hover:w-full md:group-hover:rounded-full"></span>
              <span className="relative z-10 text-black text-[16px] font-medium leading-[22px] font-outfit">Contact Us</span>
              <img src="/lp/rightArrow.svg" alt="arrow-right" width="20" height="20" className="relative z-10 transition-transform duration-300" />
            </a>
            <a
              href="mailto:sales@truperformance.us"
              className="group flex space-x-4 my-6 text-black md:my-[30px] sm:mt-[79px] sm:mb-[39px] font-medium text-[15px] leading-[22.5px] cursor-pointer hover:text-[#FF5A24] transition-colors"
            >
              sales@truperformance.us
              <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 23 23" fill="none" stroke="#262626" className="group-hover:stroke-[#FF5A24] transition-colors">
                <path d="M9.5 7.59115L13.3333 11.4245L9.5 15.2578" strokeWidth="1.91667" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <Separator orientation="horizontal" className="md:hidden h-px bg-[#E0CCC0] my-6" />
          </div>

          <div className="md:border-r md:border-white md:pl-[40px] pl-0">
            <h3 className="font-semibold font-inter text-black md:mt-[40px] md:text-[15px] text-[13px] md:mb-[22px] mb-[10px]">About Product</h3>
            <ul className="space-y-[8px]">
              <li>
                <a href="/docs" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/support" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Support
                </a>
              </li>
            </ul>
          </div>

          <div className="md:border-r border-white md:pl-[30px] pl-0 pb-[24px] md:pb-[40px]">
            <h3 className="font-semibold font-inter text-black md:mt-[40px] md:text-[15px] text-[13px] md:mb-[22px] mb-[10px]">All Pages</h3>
            <ul className="space-y-[8px]">
              <li>
                <a href="https://academy.truperformancedigital.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Tru Learning Academy
                </a>
              </li>
              <li>
                <a href="https://sales.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Sales Enabler
                </a>
              </li>
              <li>
                <a href="https://subtracker.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Subscription Tracker
                </a>
              </li>
              <li>
                <a href="https://tru-acf.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  ACF Generator
                </a>
              </li>
              <li>
                <a href="https://cv-parser.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  HR CV Parser
                </a>
              </li>
              <li>
                <Link to="/dashboard" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Meeting Assitant
                </Link>
                <span className="ml-2 hidden sm:inline-flex item-center justify-center text-[#FF5A24] text-[11px] font-[500] px-[6px] border-[#FF5A24] border rounded-[100px] mr-[6px]">You're here</span>
              </li>
              <li>
                <a href="https://backlinkgenerator.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Backlink Generator
                </a>
              </li>
              <li>
                <a href="https://uptime.tp-devserver.com/" target="_blank" rel="noreferrer" className="text-[#4D4D4D] md:text-[16px] text-[14px] md:leading-[24px] leading-[22px] font-medium hover:text-[#FF5A24]">
                  Uptime Tracker
                </a>
              </li>
            </ul>
          </div>

          <div className="border-white md:pl-[30px] mt-[24px] md:mt-[0] pl-0">
            <h3 className="font-semibold font-inter text-black md:mt-[40px] text-[15px] md:mb-[22px] mb-[8px]">Our Socials</h3>
            <div className="flex items-start gap-[10px] md:mb-5 mb-[24px]">
              <img src="/lp/youTubeFooter.svg" alt="YouTube" className="w-[44px] h-[44px] cursor-pointer transition-transform duration-200 hover:scale-110" />
              <img src="/lp/xFooter.svg" alt="X" className="w-[44px] h-[44px] cursor-pointer transition-transform duration-200 hover:scale-110" />
              <img src="/lp/instaFooter.svg" alt="Instagram" className="w-[44px] h-[44px] cursor-pointer transition-transform duration-200 hover:scale-110" />
            </div>
          </div>
        </div>

        <div className="pt-[20px] md:pb-[20px] pb-[32px] border-t border-[#fff]">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center">
            <p className="text-[#4D4D4D] text-[15px] font-medium leading-[22.5px] font-inter">© 2026 Tru Performance. All rights reserved.</p>
            <div className="flex md:gap-[64px] gap-[16px] mt-4 md:mt-0">
              <a href="/terms" className="text-[#4D4D4D] leading-[21px] font-medium hover:text-[#FF5A24] md:text-sm text-[11px]">
                Terms & Conditions
              </a>
              <a href="/privacy" className="text-[#4D4D4D] leading-[21px] font-medium hover:text-[#FF5A24] text-sm md:text-sm text-[11px]">
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
        <div className="lg:pt-[26px] pb-[26px] lg:pb-0">
          <img src="/lp/footerlogoBg.webp" alt="" className="w-full h-auto" />
        </div>
      </div>
    </footer>
  );
}
