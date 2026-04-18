import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/I18nContext";

export type ProductImageZoomProps = {
  src: string;
  /** Naslov u lightboxu (npr. ime proizvoda). */
  altName?: string;
  /** aria-label na dugmetu za otvaranje (podrazumevano: prevod za pregled slike). */
  buttonAriaLabel?: string;
  thumbClassName?: string;
  /** Dugme oko slike (npr. `cart-thumb-btn` u korpi). */
  buttonClassName?: string;
  imgStyle?: CSSProperties;
};

/**
 * Klik na sliku proizveda otvara punoekranski pregled (lightbox), iznad modala (portal).
 */
export function ProductImageZoom({
  src,
  altName = "",
  buttonAriaLabel,
  thumbClassName = "product-img",
  buttonClassName = "product-img-zoom-btn",
  imgStyle,
}: ProductImageZoomProps) {
  const { t } = useI18n();
  const trimmed = (src || "").trim();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!trimmed) return null;

  const label = altName.trim() || t("cart.preview_image");
  const openBtnAria = buttonAriaLabel?.trim() || t("cart.preview_image");

  const lightbox =
    open &&
    createPortal(
      <div
        className="modal-backdrop product-image-zoom-backdrop"
        role="presentation"
        onClick={() => setOpen(false)}
      >
        <div
          className="cart-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cart-image-lightbox__toolbar">
            <button type="button" className="btn" onClick={() => setOpen(false)} aria-label={t("cart.preview_close")}>
              {t("cart.preview_close")}
            </button>
          </div>
          <img className="cart-image-lightbox__img" src={trimmed} alt={label} />
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={openBtnAria}
      >
        <img className={thumbClassName} src={trimmed} alt="" style={imgStyle} />
      </button>
      {lightbox}
    </>
  );
}
