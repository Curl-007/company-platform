export default function AiChatContent({ content }: { content: string }) {
  return (
    <>
      {content.split('\n').map((line, index) => {
        const text = line
          .replace(/\*\*/g, '')
          .replace(/^#{1,6}\s+/, '')
          .replace(/^[-*]\s+/, '• ');
        return text.trim() ? <p key={`${index}-${text.slice(0, 12)}`}>{text}</p> : <br key={`br-${index}`} />;
      })}
    </>
  );
}
