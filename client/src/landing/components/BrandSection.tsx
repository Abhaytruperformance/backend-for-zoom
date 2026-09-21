export default function BrandSection() {
  return (
    <section className="mx-auto max-w-[1200px] px-8 sm:px-0">
      <div className="overflow-hidden rounded-[12px] bg-[url('/lp/brandSectionBg.webp')] bg-cover bg-center my-8 border border-[#E3E3E3] sm:p-8">
        <div className="grid gap-[25px] sm:grid-cols-3 m-[15px] lg:m-0">
          <div className="flex flex-row gap-3 border-b border-[#D9D9D9] pb-6 sm:border-b-0 sm:border-r sm:pr-[25px] sm:pb-0">
            <div className="inline-flex h-6 w-6 items-center justify-center">
              <img src="/lp/brandIcon1.svg" alt="" className="h-6 w-6 max-w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-[-0.36px] leading-[24px] text-[#1A1A1A]">Automatic meeting capture</h3>
              <p className="mt-[6px] text-sm font-medium leading-[21px] tracking-[-0.16px] text-[#4D4D4D] font-outfit">
                Connect Zoom once — every recorded meeting is picked up automatically once its transcript is ready, no manual upload.
              </p>
            </div>
          </div>

          <div className="flex flex-row gap-3 border-b border-[#D9D9D9] pb-6 sm:border-b-0 sm:border-r sm:pr-[25px] sm:pb-0">
            <div className="inline-flex h-6 w-6 items-center justify-center">
              <img src="/lp/brandIcon2.svg" alt="" className="h-6 w-6 max-w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-[-0.36px] leading-[24px] text-[#1A1A1A]">AI-extracted decisions & action items</h3>
              <p className="mt-[6px] text-sm font-medium leading-[21px] tracking-[-0.16px] text-[#4D4D4D] font-outfit">
                A later meeting that changes a decision or reassigns a commitment correctly updates the record instead of creating a duplicate.
              </p>
            </div>
          </div>

          <div className="flex flex-row gap-3 border-[#D9D9D9] pb-6 sm:border-b-0 sm:pb-0">
            <div className="inline-flex h-6 w-6 items-center justify-center">
              <img src="/lp/brandIcon1.svg" alt="" className="h-6 w-6 max-w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-[-0.36px] leading-[24px] text-[#1A1A1A]">Human-approved follow-ups</h3>
              <p className="mt-[6px] text-sm font-medium leading-[21px] tracking-[-0.16px] text-[#4D4D4D] font-outfit">
                Every AI-drafted email is edited and explicitly approved by a person before it sends — never automatic.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 mt-6 rounded-[10px] border border-[#E3E3E3] lg:p-8 px-4 py-6 shadow-sm m-[15px] lg:mx-0 lg:mb-0 text-center">
          <p className="text-base tracking-[-0.16px] text-[#1A1A1A] font-medium leading-6">
            Built on Tru Performance's own internal automation framework — used to run our own client relationships before it was made available as a standalone app.
          </p>
        </div>
      </div>
    </section>
  );
}
