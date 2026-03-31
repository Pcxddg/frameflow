import { useRef, useState, useEffect, useCallback } from 'react';

interface CustomScrollbarProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function CustomScrollbar({ containerRef }: CustomScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const updateThumb = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth) {
      setIsVisible(false);
      return;
    }
    setIsVisible(true);
    const ratio = clientWidth / scrollWidth;
    const trackWidth = trackRef.current?.clientWidth || clientWidth;
    setThumbWidth(Math.max(ratio * trackWidth, 32));
    setThumbLeft((scrollLeft / (scrollWidth - clientWidth)) * (trackWidth - Math.max(ratio * trackWidth, 32)));
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateThumb();
    el.addEventListener('scroll', updateThumb, { passive: true });
    const resizeObserver = new ResizeObserver(updateThumb);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateThumb);
      resizeObserver.disconnect();
    };
  }, [containerRef, updateThumb]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartScroll.current = containerRef.current?.scrollLeft || 0;
    (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const delta = e.clientX - dragStartX.current;
    const trackWidth = track.clientWidth;
    const scrollableWidth = el.scrollWidth - el.clientWidth;
    const scrollDelta = (delta / (trackWidth - thumbWidth)) * scrollableWidth;
    el.scrollLeft = dragStartScroll.current + scrollDelta;
  }, [isDragging, containerRef, thumbWidth]);

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const rect = track.getBoundingClientRect();
    const clickPos = e.clientX - rect.left;
    const trackWidth = rect.width;
    const scrollableWidth = el.scrollWidth - el.clientWidth;
    el.scrollTo({
      left: (clickPos / trackWidth) * scrollableWidth,
      behavior: 'smooth',
    });
  }, [containerRef]);

  if (!isVisible) return null;

  return (
    <div
      ref={trackRef}
      onClick={onTrackClick}
      className="ff-custom-scrollbar-track"
      style={{
        position: 'absolute',
        bottom: 4,
        left: 12,
        right: 12,
        height: 6,
        borderRadius: 999,
        background: 'var(--ff-scroll-track, rgba(0,0,0,0.04))',
        cursor: 'pointer',
        zIndex: 1,
        transition: 'opacity 0.2s, height 0.2s',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onLostPointerCapture={onPointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: thumbLeft,
          width: thumbWidth,
          height: '100%',
          borderRadius: 999,
          background: isDragging
            ? 'var(--ff-scroll-thumb-hover)'
            : 'var(--ff-scroll-thumb)',
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: isDragging ? 'none' : 'background 0.15s ease',
        }}
      />
    </div>
  );
}
