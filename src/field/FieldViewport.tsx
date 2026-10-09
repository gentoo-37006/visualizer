import type { CSSProperties, ReactNode, Ref, SVGProps } from "react";

type Props = {
  image: string;
  width: number;
  height: number;
  padding?: number;
  children: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
  imageClassName?: string;
  overlayClassName?: string;
  style?: CSSProperties;
  overlayProps?: SVGProps<SVGSVGElement>;
};

export function FieldViewport({ image, width, height, padding = 0, children, containerRef, svgRef, className, imageClassName, overlayClassName, style, overlayProps }: Props) {
  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      {/* Plain images keep this renderer usable outside Next.js and on the Hub. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Field map" className={imageClassName} draggable={false} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
      <svg {...overlayProps} ref={svgRef} className={overlayClassName} viewBox={`0 0 ${width + 2 * padding} ${height + 2 * padding}`} style={{ position: "absolute", top: -padding, left: -padding, width: `calc(100% + ${2 * padding}px)`, height: `calc(100% + ${2 * padding}px)`, overflow: "visible", ...overlayProps?.style }}>
        {children}
      </svg>
    </div>
  );
}
