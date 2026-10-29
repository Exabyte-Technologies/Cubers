import React, { useEffect, useRef, useState } from "react";
export function ConsentDocumentViewer({
  id,
  api,
  t,
  close,
  reviewed,
}: {
  id: string;
  api: (path: string) => Promise<any>;
  t: (en: string, zh: string) => string;
  close: () => void;
  reviewed: (id: string) => void;
}) {
  const [pages, setPages] = useState<string[]>([]),
    [error, setError] = useState("");
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        event.preventDefault();
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    void api(`media/${id}/document-review`)
      .then((result) => {
        if (!alive) return;
        if (
          result.id !== id ||
          !Array.isArray(result.pages) ||
          result.pages.length < 1 ||
          result.pages.length > 8 ||
          !result.pages.every(
            (p: unknown) =>
              typeof p === "string" &&
              p.length < 1400100 &&
              /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p),
          ) ||
          typeof result.reviewId !== "string"
        )
          throw Error("Invalid document preview");
        setPages(result.pages);
        reviewed(result.reviewId);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [id]);
  return (
    <div className="document-backdrop">
      <section
        className="document-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-title"
      >
        <button ref={button} onClick={close}>
          {t("Close document", "关闭文件")}
        </button>
        <h2 id="document-title">
          {t("Private consent document", "私密监护同意文件")}
        </h2>
        <p>
          {t(
            "Rendered page images. Digital signatures are not validated; check the signed document, identity and relationship independently. The original remains private and unchanged.",
            "此处仅显示页面图像，不验证数字签名。请独立核验签署文件、身份及监护关系。原件仍私密保存，内容未修改。",
          )}
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : !pages.length ? (
          <p role="status">
            {t("Preparing isolated preview…", "正在准备隔离预览……")}
          </p>
        ) : (
          pages.map((page, i) => (
            <figure key={i}>
              <img
                src={page}
                alt={t(
                  `Consent document page ${i + 1} of ${pages.length}`,
                  `监护同意文件第 ${i + 1} 页，共 ${pages.length} 页`,
                )}
              />
              <figcaption>
                {i + 1} / {pages.length}
              </figcaption>
            </figure>
          ))
        )}
      </section>
    </div>
  );
}
