import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import { apiFetch } from "../api/client";
import { useI18n } from "../i18n/I18nContext";

export type OrderQrScannerModalProps = {
  onClose: () => void;
  onResolved: (orderId: number) => void;
};

async function disposeScanner(inst: Html5Qrcode | null, regionElementId: string) {
  if (!inst) return;
  try {
    await inst.stop();
  } catch {
    /* već zaustavljeno */
  }
  try {
    await inst.clear();
  } catch {
    /* */
  }
  const box = document.getElementById(regionElementId);
  if (box) box.innerHTML = "";
}

/**
 * Otvara kameru (zadnja kamera na telefonu), čita QR sa tekstom porudžbine, poziva API i vraća id.
 * Roditelj ga montira samo dok je dijalog otvoren.
 */
export function OrderQrScannerModal({ onClose, onResolved }: OrderQrScannerModalProps) {
  const { t } = useI18n();
  const reactUid = useId().replace(/[^a-zA-Z0-9]/g, "") || "x";
  const regionId = useMemo(() => `order-qr-scan-${reactUid}`, [reactUid]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [scanNonce, setScanNonce] = useState(0);

  useEffect(() => {
    handledRef.current = false;
    setCameraErr(null);

    let cancelled = false;
    const regionElementId = regionId;

    const onDecode = async (decodedText: string, active: Html5Qrcode) => {
      if (handledRef.current || cancelled) return;
      handledRef.current = true;
      await disposeScanner(active, regionElementId);
      scannerRef.current = null;
      try {
        const res = await apiFetch<{ id: number }>(
          `/api/v1/orders/scan/resolve?raw=${encodeURIComponent(decodedText)}`,
        );
        if (!cancelled) onResolvedRef.current(res.id);
      } catch (e) {
        handledRef.current = false;
        if (!cancelled) {
          setResolveErr(e instanceof Error ? e.message : String(e));
          setScanNonce((n) => n + 1);
        }
      }
    };

    const run = async () => {
      await disposeScanner(scannerRef.current, regionElementId);
      scannerRef.current = null;
      if (cancelled) return;

      const inst = new Html5Qrcode(regionElementId, { verbose: false });
      if (cancelled) {
        await disposeScanner(inst, regionElementId);
        return;
      }
      scannerRef.current = inst;
      try {
        await inst.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1,
          },
          (text) => {
            void onDecode(text, inst);
          },
          () => {},
        );
      } catch (e: unknown) {
        if (!cancelled) setCameraErr(e instanceof Error ? e.message : String(e));
      }
    };

    void run();

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      scannerRef.current = null;
      void disposeScanner(inst, regionElementId);
    };
  }, [regionId, scanNonce]);

  const portal = createPortal(
    <div className="modal-backdrop order-qr-scan-backdrop" role="presentation" onClick={() => onClose()}>
      <div
        className="order-qr-scan-modal card"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.scan_order_qr")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="order-qr-scan-modal__head">
          <h2 className="order-qr-scan-modal__title">{t("nav.scan_order_qr")}</h2>
          <button type="button" className="btn" onClick={() => onClose()}>
            {t("nav.scan_order_close")}
          </button>
        </div>
        <p className="order-qr-scan-modal__hint">{t("nav.scan_order_hint")}</p>
        <div id={regionId} className="order-qr-scan-modal__viewport" />
        {cameraErr ? (
          <p className="order-qr-scan-modal__err" role="alert">
            {cameraErr}
          </p>
        ) : null}
        {resolveErr ? (
          <div className="order-qr-scan-modal__err-block">
            <p className="order-qr-scan-modal__err" role="alert">
              {resolveErr}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResolveErr(null);
                setScanNonce((n) => n + 1);
              }}
            >
              {t("nav.scan_order_retry")}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );

  return portal;
}
