import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Summary Arena — Crowdsourced LLM Summarization Benchmark';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
  const newsreader = await fetch(
    new URL(
      'https://fonts.gstatic.com/s/newsreader/v14/ga6Kaw1JXG995rOHJL48r6A3PZpopplE.woff2',
    ),
  ).then((res) => res.arrayBuffer());

  const outfit = await fetch(
    new URL(
      'https://fonts.gstatic.com/s/outfit/v12/QGYvz_MVcBeNP4NJuktMxqU.woff2',
    ),
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FAF6F1',
          fontFamily: 'Outfit',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Subtle paper texture overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              radial-gradient(circle at 20% 80%, rgba(196, 112, 75, 0.04) 0%, transparent 50%),
              radial-gradient(circle at 80% 20%, rgba(107, 122, 61, 0.04) 0%, transparent 50%)
            `,
          }}
        />

        {/* Top accent line */}
        <div
          style={{
            height: 4,
            width: '100%',
            background: 'linear-gradient(90deg, #C4704B 0%, #B8860B 40%, #6B7A3D 70%, #7A8F6E 100%)',
          }}
        />

        {/* Main content area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            flex: 1,
            padding: '60px 80px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Top label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 32,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#C4704B',
              }}
            />
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#8A7D6B',
              }}
            >
              Crowdsourced LLM Benchmark
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              marginBottom: 48,
            }}
          >
            <span
              style={{
                fontFamily: 'Newsreader',
                fontSize: 96,
                fontWeight: 700,
                color: '#2C2418',
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              Summary
            </span>
            <span
              style={{
                fontFamily: 'Newsreader',
                fontSize: 96,
                fontWeight: 700,
                color: '#C4704B',
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              Arena
            </span>
          </div>

          {/* Decorative bar chart visualization */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 16,
              height: 100,
              marginBottom: 40,
            }}
          >
            <div style={{ width: 32, height: 45, backgroundColor: '#C4704B', borderRadius: 4 }} />
            <div style={{ width: 32, height: 70, backgroundColor: '#8B7355', borderRadius: 4 }} />
            <div style={{ width: 32, height: 55, backgroundColor: '#6B7A3D', borderRadius: 4 }} />
            <div style={{ width: 32, height: 85, backgroundColor: '#7A8F6E', borderRadius: 4 }} />
            <div style={{ width: 32, height: 60, backgroundColor: '#A69580', borderRadius: 4 }} />
            <div style={{ width: 32, height: 95, backgroundColor: '#C4704B', borderRadius: 4 }} />
            <div style={{ width: 32, height: 40, backgroundColor: '#B5AA98', borderRadius: 4 }} />
            <div style={{ width: 32, height: 75, backgroundColor: '#8B7355', borderRadius: 4 }} />
          </div>

          {/* Bottom description */}
          <span
            style={{
              fontSize: 24,
              color: '#5C4F3D',
              textAlign: 'center',
              maxWidth: 700,
              lineHeight: 1.5,
            }}
          >
            Blindly benchmark LLM summarization quality through community voting
          </span>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 80px',
            borderTop: '1px solid #E5DED3',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <span
            style={{
              fontSize: 18,
              color: '#8A7D6B',
              fontStyle: 'italic',
              fontFamily: 'Newsreader',
            }}
          >
            Summary Arena v1.0
          </span>
          <span
            style={{
              fontSize: 16,
              color: '#B5AA98',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Vote · Compare · Rank
          </span>
        </div>

        {/* Decorative corner elements */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 60,
            width: 60,
            height: 60,
            border: '2px solid #E5DED3',
            borderRadius: '50%',
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 40,
            width: 40,
            height: 40,
            border: '1px solid #E5DED3',
            transform: 'rotate(45deg)',
            opacity: 0.4,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Newsreader',
          data: newsreader,
          style: 'normal',
          weight: 700,
        },
        {
          name: 'Outfit',
          data: outfit,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  );
}
