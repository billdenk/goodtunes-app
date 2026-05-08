interface GoodTunesLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GoodTunesLogo({ size = "md", className = "" }: GoodTunesLogoProps) {
  const iconSize = size === "sm" ? 14 : size === "lg" ? 28 : 20;
  const textClass =
    size === "sm"
      ? "text-base font-bold tracking-tight"
      : size === "lg"
      ? "text-3xl font-bold tracking-tight"
      : "text-xl font-bold tracking-tight";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={iconSize}
        height={Math.round(iconSize * 1.267)}
        viewBox="0 0 15 19"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7.46699 12.4085C7.10501 12.4085 6.80195 12.1054 6.80195 11.7519V3.10634L6.85246 1.8436L6.28002 2.44129L5.00886 3.80505C4.89101 3.93974 4.7058 4.00709 4.54586 4.00709C4.19229 4.00709 3.93974 3.75454 3.93974 3.40939C3.93974 3.23261 4.00709 3.09792 4.13336 2.97164L6.97873 0.227293C7.15552 0.0589278 7.29863 0 7.46699 0C7.64377 0 7.78689 0.0589278 7.95525 0.227293L10.8006 2.97164C10.9269 3.09792 11.0027 3.23261 11.0027 3.40939C11.0027 3.75454 10.7333 4.00709 10.3881 4.00709C10.2198 4.00709 10.0514 3.93974 9.93354 3.80505L8.65397 2.44129L8.08994 1.8436L8.14045 3.10634V11.7519C8.14045 12.1054 7.82898 12.4085 7.46699 12.4085ZM2.64333 19C0.883917 19 0 18.1245 0 16.3903V7.98892C0 6.25476 0.883917 5.37926 2.64333 5.37926H5.17723V6.7346H2.66017C1.81834 6.7346 1.35534 7.18919 1.35534 8.06469V16.3146C1.35534 17.1901 1.81834 17.6447 2.66017 17.6447H12.2738C13.1072 17.6447 13.5871 17.1901 13.5871 16.3146V8.06469C13.5871 7.18919 13.1072 6.7346 12.2738 6.7346H9.76518V5.37926H12.2991C14.0585 5.37926 14.9424 6.25476 14.9424 7.98892V16.3903C14.9424 18.1245 14.0585 19 12.2991 19H2.64333Z"
          fill="white"
        />
      </svg>
      <span className={`text-white leading-none ${textClass}`}>
        GoodTunes<sup className="text-[0.55em] align-super font-normal">®</sup>
      </span>
    </div>
  );
}
