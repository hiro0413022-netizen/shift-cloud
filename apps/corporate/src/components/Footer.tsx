export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div className="footer-logo">YOZAN<span> GROUP</span></div>
          <p style={{ marginTop: '8px', fontSize: '13px' }}>ゴルフ業界の成長を、仕組みで支える会社。</p>
          <p style={{ marginTop: '6px', fontSize: '13px' }}>
            <a href="https://yozan-inc.jp">yozan-inc.jp</a>
            {' '}&nbsp;/{' '}&nbsp;
            <a href="mailto:info@yozan-inc.jp">info@yozan-inc.jp</a>
          </p>
        </div>
        <div style={{ fontSize: '13px' }}>
          © {new Date().getFullYear()} YOZAN GROUP
        </div>
      </div>
    </footer>
  )
}
