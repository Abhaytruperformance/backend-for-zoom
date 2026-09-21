export default function CTASection() {
  return (
    <section className="container md:max-w-[1200px] max-w-full mx-auto md:pb-[75px] md:pt-[50px] pt-[25px] pb-[0px]">
      <div
        className="lg:rounded-[20px] rounded-none mx-auto flex flex-col items-center justify-center gap-[20px] min-h-[271px] md:py-[75px] py-[50px] w-full md:px-4 px-8 text-white bg-cover bg-center bg-no-repeat relative"
        style={{ backgroundImage: "url('/lp/ctaBannerBg.png')" }}
      >
        <h2 className="w-full md:max-w-[620px] tracking-[-1px] max-w-[280px] text-center font-inter sm:max-w-[684px] text-[#fff] text-[28px] md:text-3xl sm:text-4xl lg:text-[42px] font-normal leading-[36.4px] sm:leading-[45px] md:leading-[58.8px]">
          <span className="font-medium gradient-text">Stop writing meeting notes. </span>
          Start approving them.
        </h2>
        <p className="w-full max-w-[400px] md:max-w-[464px] text-[#E0E0E0] text-center text-[14px] sm:text-[15px] md:text-[16px] font-normal leading-[20px] sm:leading-[22px] md:leading-[24px] tracking-[-0.17px] text-wrap">
          Let AI extract what actually happened in the call, so your team can focus on the client relationship, not the writeup.
        </p>
        <div className="flex flex-col sm:flex-row gap-[20px] md:gap-[24px] sm:gap-[28px] md:mt-[28px] mt-6">
          <div className="flex flex-col items-center justify-center md:gap-7 gap-3 sm:flex-row">
            <a
              href="/login"
              className="group relative flex items-center gap-[10px] justify-between h-[45px] px-6 rounded-full overflow-hidden bg-[#FF5A24] text-white md:bg-transparent md:text-black text-[16px] font-[500] sm:w-auto"
            >
              <span className="absolute left-0 top-0 h-full md:duration-500 w-[45px] bg-[#FF5A24] rounded-full transition-all ease-in-out md:group-hover:w-full md:group-hover:rounded-full"></span>
              <span className="relative z-10 text-white text-[16px] font-medium leading-[22px] font-outfit">Start Free</span>
              <img src="/lp/whiteArrow.svg" alt="arrow-right" width="20" height="20" className="relative z-10 transition-transform duration-300" />
            </a>
            <a
              href="mailto:sales@truperformance.us"
              className="inline-flex font-outfit items-center justify-center rounded-full border border-[#E0E0E0] px-6 py-2.5 text-[16px] leading-[24px] font-medium md:text-white text-black md:bg-transparent bg-[#FFFFFF] transition md:hover:bg-[#fff] hover:text-[#FF5A24]"
            >
              Get A Demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
