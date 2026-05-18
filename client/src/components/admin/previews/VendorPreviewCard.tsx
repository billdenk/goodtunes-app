import { MapPin, Globe, Guitar } from "lucide-react";
import { PhoneBezel } from "./PhoneBezel";

export interface VendorPreviewVendor {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
  coverUrl: string | null;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  homeUrl: string | null;
}

export interface VendorPreviewInstrument {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
}

/**
 * Apple-Music-style vendor sheet at phone scale. Same shape as
 * LabelPreview — floating toolbar over a tall hero, profile row with
 * avatar + name + tagline, then a bio + the instruments grid the vendor
 * stocks. Lets Bill see what a fan would see when tapping a vendor row
 * inside an InstrumentSheet without leaving the admin.
 */
export function VendorPreviewCard({
  vendor,
  instruments,
}: {
  vendor: VendorPreviewVendor;
  instruments: VendorPreviewInstrument[];
}) {
  return (
    <PhoneBezel
      testId="preview-vendor"
      footer={
        <>
          Preview of the in-app VendorSheet — {instruments.length}{" "}
          {instruments.length === 1 ? "product" : "products"}.
        </>
      }
    >
      {/* Hero */}
      <div className="relative w-full" style={{ aspectRatio: "1 / 1.05" }}>
        {vendor.coverUrl ? (
          <img
            src={vendor.coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="img-preview-vendor-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#00062B" }}
          >
            {vendor.logoUrl && (
              <div className="w-32 h-32 rounded-2xl overflow-hidden bg-white flex items-center justify-center p-3">
                <img
                  src={vendor.logoUrl}
                  alt=""
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, #00062B 70%, #00062B 100%)",
          }}
        />
      </div>

      {/* Profile row */}
      <div className="px-5 -mt-7 relative flex items-end gap-3">
        <div
          className="flex-shrink-0 w-[72px] h-[72px] rounded-2xl overflow-hidden flex items-center justify-center p-1.5"
          style={{ background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
          data-testid="preview-vendor-logo"
        >
          {vendor.logoUrl ? (
            <img
              src={vendor.logoUrl}
              alt=""
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="text-[26px] font-bold" style={{ color: "#00062B" }}>
              {(vendor.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <h2
            className="text-white font-bold leading-tight tracking-tight line-clamp-2 break-words"
            style={{ fontSize: (vendor.name?.length ?? 0) > 18 ? 17 : 20 }}
            data-testid="text-preview-vendor-name"
          >
            {vendor.name || "Unnamed vendor"}
          </h2>
          {vendor.tagline && (
            <p
              className="text-[13px] mt-0.5 line-clamp-2"
              style={{ color: "rgba(235,235,245,0.7)" }}
            >
              {vendor.tagline}
            </p>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="px-5 pt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {vendor.location && (
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: "rgba(235,235,245,0.7)" }}
          >
            <MapPin className="w-3 h-3" />
            {vendor.location}
          </span>
        )}
        {vendor.domain && (
          <span
            className="inline-flex items-center gap-1 text-[12px]"
            style={{ color: "#319ED8" }}
          >
            <Globe className="w-3 h-3" />
            {vendor.domain}
          </span>
        )}
      </div>

      {/* Bio */}
      {vendor.bio && (
        <div className="px-5 pt-4">
          <p
            className="text-[13px] leading-relaxed whitespace-pre-line line-clamp-5"
            style={{ color: "rgba(235,235,245,0.72)" }}
            data-testid="text-preview-vendor-bio"
          >
            {vendor.bio}
          </p>
        </div>
      )}

      {/* Instruments */}
      <div className="px-5 pt-5 pb-6">
        <h3 className="text-white text-[16px] font-bold leading-tight tracking-tight mb-3">
          Featured gear
        </h3>
        {instruments.length === 0 ? (
          <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
            No gear attached yet. Add this vendor on a Gear page's Vendors tab.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {instruments.map((it) => (
              <div
                key={it.id}
                className="flex flex-col text-left"
                data-testid={`preview-vendor-instrument-${it.id}`}
              >
                <div
                  className="aspect-square rounded-xl overflow-hidden"
                  style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                >
                  {it.photoUrl ? (
                    <img
                      src={it.photoUrl}
                      alt={it.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white/40"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                      aria-hidden
                    >
                      <Guitar className="w-7 h-7" />
                    </div>
                  )}
                </div>
                <p className="text-white text-[12.5px] font-semibold leading-tight truncate mt-2">
                  {it.name}
                </p>
                <p
                  className="text-[11px] truncate mt-0.5"
                  style={{ color: "rgba(235,235,245,0.5)" }}
                >
                  {it.shortCategory || it.category}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneBezel>
  );
}
