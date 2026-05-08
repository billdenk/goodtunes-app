import { ChevronLeftIcon, Share2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const albumCards = [
  {
    title: "When the World Stops",
    artist: "Tim Snider & Wolfgang Timber",
    image: "/figmaAssets/artworks-000451097049-kerecr-t500x500.png",
  },
  {
    title: "Guitar as a Voice",
    artist: "Fernando Perdomo",
    image: "/figmaAssets/artworks-000451097049-kerecr-t500x500-2.png",
  },
  {
    title: "Love Spell EP",
    artist: "Whitney Lyman",
    image: "/figmaAssets/artworks-000451097049-kerecr-t500x500-1.png",
  },
  {
    title: "California Way",
    artist: "TOMMYGUNN",
    image: "/figmaAssets/artworks-000451097049-kerecr-t500x500-3.png",
  },
];

const bottomNavItems = [
  { label: "Discover", icon: "􀝝", active: false },
  { label: "Collection", icon: "􀏭", active: true },
  { label: "Account", initials: "BD", active: false },
];

export const DigitalGooddeed = (): JSX.Element => {
  return (
    <main className="min-h-screen w-full bg-app-background flex justify-center">
      <section className="relative w-full max-w-[400px] min-h-[848px] overflow-hidden bg-app-background text-white">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          alt="Group"
          src="/figmaAssets/group-14028.png"
        />
        <header className="absolute inset-x-0 top-0 z-10 h-[53px]">
          <img
            className="absolute left-[319px] top-[21px] h-[11px] w-[67px]"
            alt="Group"
            src="/figmaAssets/group.png"
          />
          <div className="absolute left-[21px] top-4 flex h-[21px] w-[54px] items-center">
            <div className="mt-px flex-1 text-center [font-family:'SF_Pro_Display-Regular',Helvetica] text-sm font-normal leading-[14px] tracking-[-0.28px] text-white">
              <span className="leading-4 tracking-[-0.04px] text-[#ffffff]">
                9:41
              </span>
            </div>
          </div>
          <div className="absolute left-1/2 top-[calc(50.00%_-_16px)] h-[37px] w-[127px] -translate-x-1/2 rounded-[18.5px] bg-black" />
        </header>
        <div className="absolute left-[21px] top-[61px] z-10 inline-flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Back"
            className="inline-flex h-6 w-6 items-center justify-center text-white"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="font-action-button-01 text-[length:var(--action-button-01-font-size)] font-[number:var(--action-button-01-font-weight)] leading-[var(--action-button-01-line-height)] tracking-[var(--action-button-01-letter-spacing)] [font-style:var(--action-button-01-font-style)]">
            Albums
          </span>
        </div>
        <h1 className="absolute left-1/2 top-[57px] z-20 -translate-x-1/2 font-headings-heading-04 text-[length:var(--headings-heading-04-font-size)] font-[number:var(--headings-heading-04-font-weight)] leading-[var(--headings-heading-04-line-height)] tracking-[var(--headings-heading-04-letter-spacing)] whitespace-nowrap [font-style:var(--headings-heading-04-font-style)]">
          Your GoodDeed
        </h1>
        <div className="absolute right-6 top-6 z-20">
          <button
            type="button"
            aria-label="Close"
            className="inline-flex h-6 w-6 items-center justify-center text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <h2 className="absolute left-6 top-[101px] font-headings-heading-03 text-[length:var(--headings-heading-03-font-size)] font-[number:var(--headings-heading-03-font-weight)] leading-[var(--headings-heading-03-line-height)] tracking-[var(--headings-heading-03-letter-spacing)] whitespace-nowrap [font-style:var(--headings-heading-03-font-style)]">
          Albums
        </h2>
        <div className="absolute left-6 top-[181px] z-[1] flex w-[168px] items-center justify-center gap-1.5 rounded-[22px] border-2 border-solid border-[#ffffff] px-4 py-2.5 shadow-[0px_1px_2px_#1018280d]">
          <div className="relative flex h-5 w-5 items-center justify-center">
            <div className="[font-family:'SF_Pro-ExpandedHeavy',Helvetica] text-xl leading-4 text-white">
              􀊄
            </div>
          </div>
          <div className="inline-flex items-center justify-center px-0.5">
            <div className="font-action-button-01 text-[length:var(--action-button-01-font-size)] font-[number:var(--action-button-01-font-weight)] leading-[var(--action-button-01-line-height)] tracking-[var(--action-button-01-letter-spacing)] whitespace-nowrap text-white [font-style:var(--action-button-01-font-style)]">
              Play
            </div>
          </div>
        </div>
        <div className="absolute left-52 top-[181px] z-[1] flex w-[168px] items-center justify-center gap-1.5 rounded-[22px] border-2 border-solid border-[#ffffff] px-4 py-2.5 shadow-[0px_1px_2px_#1018280d]">
          <div className="relative flex h-5 w-5 items-center justify-center">
            <div className="[font-family:'SF_Pro-Regular',Helvetica] text-base leading-4 text-white">
              􀊝
            </div>
          </div>
          <div className="inline-flex items-center justify-center px-0.5">
            <div className="font-action-button-01 text-[length:var(--action-button-01-font-size)] font-[number:var(--action-button-01-font-weight)] leading-[var(--action-button-01-line-height)] tracking-[var(--action-button-01-letter-spacing)] whitespace-nowrap text-white [font-style:var(--action-button-01-font-style)]">
              Shuffle
            </div>
          </div>
        </div>
        <section className="absolute left-6 top-[249px] z-[1] grid w-[352px] grid-cols-2 gap-x-8 gap-y-0">
          {albumCards.map((album, index) => (
            <article
              key={`${album.title}-${index}`}
              className={`flex h-[248px] w-[168px] ${
                index > 1 ? "mt-0" : ""
              } ${index >= 2 ? "translate-y-0" : ""} ${
                index === 2 || index === 3 ? "mt-0" : ""
              } ${index >= 2 ? "" : ""}`}
              style={{ marginTop: index >= 2 ? "0px" : "0px" }}
            >
              <div className="relative w-[172px] flex-1">
                <img
                  className="absolute left-[-13.95%] top-[-11.54%] h-[80.77%] w-[97.67%] rounded object-cover"
                  alt="Artworks"
                  src={album.image}
                />
                <div className="absolute left-0 top-[82.69%] flex h-[8.65%] w-[95.35%] items-center overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] font-text-caption-02 text-[length:var(--text-caption-02-font-size)] font-[number:var(--text-caption-02-font-weight)] leading-[var(--text-caption-02-line-height)] tracking-[var(--text-caption-02-letter-spacing)] text-white [font-style:var(--text-caption-02-font-style)]">
                  {album.title}
                </div>
                <div className="absolute left-0 top-[91.35%] flex h-[8.65%] w-[95.35%] items-center overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] font-text-caption-01 text-[length:var(--text-caption-01-font-size)] font-[number:var(--text-caption-01-font-weight)] leading-[var(--text-caption-01-line-height)] tracking-[var(--text-caption-01-letter-spacing)] text-[#ffffffb2] [font-style:var(--text-caption-01-font-style)]">
                  {album.artist}
                </div>
              </div>
            </article>
          ))}
        </section>
        <div className="absolute left-6 top-[497px] z-[1] hidden" />
        <div className="absolute inset-0 z-30 backdrop-blur-[27px] backdrop-brightness-[100%] [-webkit-backdrop-filter:blur(27px)_brightness(100%)]">
          <div className="absolute inset-0 bg-[#00062b59] opacity-90 backdrop-blur [-webkit-backdrop-filter:blur(8px)_brightness(100%)]" />
          <Card className="absolute left-1/2 top-[101px] w-[369px] -translate-x-1/2 rounded-[10px] border-0 bg-[#f1f1f3] shadow-none">
            <CardContent className="relative p-0">
              <img
                className="absolute left-4 top-4 h-[598px] w-[336px] object-cover"
                alt="Frame"
                src="/figmaAssets/frame-118146-1.png"
              />
              <div className="absolute left-4 top-[562px] w-[337px] overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] font-headings-heading-06 text-[length:var(--headings-heading-06-font-size)] font-[number:var(--headings-heading-06-font-weight)] leading-[var(--headings-heading-06-line-height)] tracking-[var(--headings-heading-06-letter-spacing)] text-primarypetrol-blue-01 [font-style:var(--headings-heading-06-font-style)]">
                When the World Stops
              </div>
              <div className="absolute left-4 top-[596px] w-[69px] overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] font-text-caption-01 text-[length:var(--text-caption-01-font-size)] font-[number:var(--text-caption-01-font-weight)] leading-[var(--text-caption-01-line-height)] tracking-[var(--text-caption-01-letter-spacing)] text-[#50555c] [font-style:var(--text-caption-01-font-style)]">
                GoodDeed™
              </div>
              <div className="h-[636px] w-full" />
            </CardContent>
          </Card>
          <div className="absolute bottom-[91px] left-[83px] z-40 w-[233px]">
            <Button
              type="button"
              variant="default"
              className="h-auto w-full justify-between rounded-[13px] bg-primarypetrol-blue-01 px-4 py-[13px] text-left font-body-regular text-[length:var(--body-regular-font-size)] font-[number:var(--body-regular-font-weight)] leading-[var(--body-regular-line-height)] tracking-[var(--body-regular-letter-spacing)] text-white shadow-[0px_4px_4px_#00000040] hover:bg-primarypetrol-blue-01"
            >
              <span className="truncate">Share</span>
              <Share2Icon className="h-5 w-5 shrink-0" />
            </Button>
          </div>
        </div>
        <nav className="absolute bottom-0 left-0 z-40 flex h-[100px] w-full justify-center bg-[linear-gradient(0deg,rgba(0,6,43,0.25)_50%,rgba(0,6,43,0)_100%)] shadow-[0px_4px_4px_#00000040] backdrop-blur [-webkit-backdrop-filter:blur(8px)_brightness(100%)]">
          <div className="relative mt-4 flex h-10 w-[351px] items-end justify-between px-6">
            {bottomNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="relative h-10 w-[62px]"
                aria-current={item.active ? "page" : undefined}
              >
                {item.initials ? (
                  <div className="absolute left-[17px] top-[-1px] flex h-[26px] w-[26px] items-center justify-center rounded-[200px] border border-solid border-[#ffffff]">
                    <div className="-ml-0.5 -mt-0.5 h-[18px] w-6 text-center font-text-LABEL-03 text-[length:var(--text-LABEL-03-font-size)] font-[number:var(--text-LABEL-03-font-weight)] leading-[var(--text-LABEL-03-line-height)] tracking-[var(--text-LABEL-03-letter-spacing)] text-white [font-style:var(--text-LABEL-03-font-style)]">
                      {item.initials}
                    </div>
                  </div>
                ) : (
                  <div className="absolute left-[18px] top-0 flex h-6 w-6 items-center justify-center">
                    <div
                      className={`flex h-[75%] w-[66.67%] items-center justify-center text-center text-xl leading-5 whitespace-nowrap ${
                        item.active
                          ? "[font-family:'SF_Pro-Medium',Helvetica] font-medium text-primarypetrol-blue-03"
                          : "[font-family:'SF_Pro-Light',Helvetica] font-light text-white"
                      }`}
                    >
                      {item.icon}
                    </div>
                  </div>
                )}
                <div
                  className={`absolute left-0 top-7 flex h-3 w-[60px] items-center justify-center text-center ${
                    item.active
                      ? "font-text-footnote-02 text-[length:var(--text-footnote-02-font-size)] font-[number:var(--text-footnote-02-font-weight)] leading-[var(--text-footnote-02-line-height)] tracking-[var(--text-footnote-02-letter-spacing)] text-primarypetrol-blue-03 [font-style:var(--text-footnote-02-font-style)]"
                      : "[font-family:'SF_Pro-Regular',Helvetica] text-[10px] font-normal leading-3 text-white tracking-[0]"
                  }`}
                >
                  {item.label}
                </div>
              </button>
            ))}
          </div>
        </nav>
        <footer className="absolute bottom-0 left-0 z-50 flex h-[33px] w-full items-end justify-center">
          <div className="-ml-px mb-2 h-[5px] w-[135px] rounded-[100px] bg-[#ffffff]" />
        </footer>
      </section>
    </main>
  );
};
