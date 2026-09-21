export default function Banner() {
  return (
    <section className="h-full w-full md:bg-[url('/lp/mainBgImg.webp')] bg-[url('/lp/herosectionMobilebg.webp')] bg-cover bg-center -mt-20">
      <div className="container max-w-[1200px] mx-auto flex flex-col items-center md:justify-center justify-start px-8 lg:px-0 pt-16">
        <div className="w-full max-w-full md:max-w-[500px] lg:max-w-[560px] text-center">
          <div className="text-center">
            <p
              className="md:mb-[26px] mb-[8px] inline-flex items-center gap-[5px] rounded-full font-inter bg-white px-[12px] py-[6px] lg:text-[14px] text-[13px] font-medium text-[#4D4D4D] md:mt-[45px] mt-[48px]"
              style={{ boxShadow: "0 4px 12px 0 rgba(0, 0, 0, 0.06)" }}
            >
              <span className="bg-[#FF5A24] text-white font-[500] lg:text-[14px] text-[11px] px-[8px] py-[2px] rounded-full font-inter">New</span>{" "}
              Now approved for Zoom App Marketplace Beta
            </p>
            <h1 className="font-inter text-3xl md:text-4xl md:tracking-[-1px] tracking-[-0.3px] sm:text-4xl lg:text-5xl leading-[40px] md:leading-[50px] sm:leading-[50px] lg:leading-[62px] font-medium">
              <span className="gradient-text">From meeting to memory,</span>
              <span className="text-[#1A1A1A] font-normal"> automatically.</span>
            </h1>
            <p className="md:mt-4 mt-3 mx-auto max-w-full text-sm md:text-base sm:text-base md:leading-6 leading-[22px] text-[#4D4D4D] font-normal px-2">
              Connect Zoom, and every recorded meeting turns into AI-extracted decisions, action items, and a follow-up email draft — reviewed and approved by a human before anything is ever sent.
            </p>
            <div className="mt-6 md:mt-[26px] flex flex-col items-center justify-center md:gap-7 gap-3 sm:flex-row">
              <a
                href="/login"
                className="group relative flex items-center gap-[10px] justify-between h-[45px] px-6 rounded-full overflow-hidden bg-[#FF5A24] text-white md:bg-transparent md:text-black text-[16px] font-[500] sm:w-auto"
              >
                <span className="absolute left-0 top-0 h-full md:duration-500 w-[45px] bg-[#FF5A24] rounded-full transition-all ease-in-out md:group-hover:w-full md:group-hover:rounded-full"></span>
                <span className="relative z-10 text-black text-[16px] font-medium leading-[24px] font-outfit">Start Free</span>
                <img src="/lp/rightArrow.svg" alt="arrow-right" width="20" height="20" className="relative z-10 transition-transform duration-300" />
              </a>
              <a
                href="mailto:sales@truperformance.us"
                className="inline-flex font-outfit items-center justify-center leading-[24px] rounded-full border border-[#E0E0E0] bg-[#FFFFFF00] px-6 py-2.5 text-[16px] sm:text-[16px] font-medium text-black transition hover:bg-[#fff] hover:text-[#FF5A24]"
              >
                Get A Demo
              </a>
            </div>
          </div>
        </div>
        <div className="mt-[42px] md:mt-[55px] sm:mt-[65px] h-auto w-full max-w-full mx-auto rounded-[20px] sm:rounded-[30px] bg-[url('/lp/bannerVideoBg.webp')] bg-center p-3 sm:p-4 lg:p-5">
          <img
            className="h-auto w-full md:h-[400px] lg:h-[550px] object-cover object-top border border-[#E0E0E0] rounded-[15px] sm:rounded-[20px]"
            src="/lp/demoVideoImg.png"
            alt="A real approval screen from the app — an AI-drafted follow-up email awaiting human review, with the relationship context that produced it"
          />
        </div>
      </div>
    </section>
  );
}
