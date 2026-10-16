import type { ReactNode } from 'react';
import { Lexer } from 'marked';
import type { Token, Tokens } from 'marked';

/*
 * Renders the model's reply as Markdown WITHOUT innerHTML: the renderer runs with Node integration, so HTML coming from
 * a model (or from task titles it repeats) must never reach the DOM as markup. Only the subset a chat answer needs is
 * supported; raw HTML, images and links are shown as plain text.
 */

function inline(tokens: Token[] | undefined, keyPrefix: string): ReactNode[] {
    return (tokens ?? []).map((tok, i) => {
        const key = `${keyPrefix}-${i}`;
        switch (tok.type) {
            case 'strong': return <strong key={key}>{inline((tok as Tokens.Strong).tokens, key)}</strong>;
            case 'em': return <em key={key}>{inline((tok as Tokens.Em).tokens, key)}</em>;
            case 'del': return <del key={key}>{inline((tok as Tokens.Del).tokens, key)}</del>;
            case 'codespan': return <code key={key} className="rounded bg-background/70 px-1 py-0.5 text-[0.85em] font-mono">{(tok as Tokens.Codespan).text}</code>;
            case 'br': return <br key={key} />;
            case 'link': return <span key={key}>{inline((tok as Tokens.Link).tokens, key)}</span>;
            case 'text': {
                const t = tok as Tokens.Text;
                return t.tokens?.length ? <span key={key}>{inline(t.tokens, key)}</span> : t.text;
            }
            default: return (tok as { raw?: string }).raw ?? '';
        }
    });
}

function block(tokens: Token[], keyPrefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    tokens.forEach((tok, i) => {
        const key = `${keyPrefix}-${i}`;
        switch (tok.type) {
            case 'space': return;
            case 'paragraph':
                out.push(<p key={key} className="my-1 first:mt-0 last:mb-0">{inline((tok as Tokens.Paragraph).tokens, key)}</p>);
                return;
            case 'heading':
                out.push(<p key={key} className="my-1 font-semibold">{inline((tok as Tokens.Heading).tokens, key)}</p>);
                return;
            case 'list': {
                const list = tok as Tokens.List;
                const items = list.items.map((item, j) => <li key={`${key}-${j}`}>{block(item.tokens, `${key}-${j}`)}</li>);
                out.push(list.ordered
                    ? <ol key={key} className="my-1 list-decimal pl-5 space-y-0.5">{items}</ol>
                    : <ul key={key} className="my-1 list-disc pl-5 space-y-0.5">{items}</ul>);
                return;
            }
            case 'code':
                out.push(<pre key={key} className="my-1 overflow-x-auto rounded bg-background/70 p-2 text-xs font-mono">{(tok as Tokens.Code).text}</pre>);
                return;
            case 'blockquote':
                out.push(<blockquote key={key} className="my-1 border-l-2 pl-2 text-muted-foreground">{block((tok as Tokens.Blockquote).tokens, key)}</blockquote>);
                return;
            case 'hr':
                out.push(<hr key={key} className="my-2" />);
                return;
            case 'text': {
                // A list item's text token, or loose text.
                const t = tok as Tokens.Text;
                out.push(<span key={key}>{t.tokens?.length ? inline(t.tokens, key) : t.text}</span>);
                return;
            }
            default:
                out.push(<p key={key} className="my-1 whitespace-pre-wrap">{(tok as { raw?: string }).raw ?? ''}</p>);
        }
    });
    return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
    return <div className={className}>{block(new Lexer({ gfm: true, breaks: true }).lex(text), 'md')}</div>;
}
