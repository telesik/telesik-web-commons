// Три состояния кнопки «Следующий раунд» в матче с внешним игроком; в
// локальной игре состояние договора игнорируется.
import { describe, expect, it } from 'vitest';
import { nextRoundButton } from '../../src/shell/next-round-button';

const t = { btnNextRound: 'Следующий раунд', btnWaiting: 'Ждём соперника', btnPeerReady: 'Соперник готов' };

describe('nextRoundButton', () => {
  it('никто не нажал — обычная активная кнопка', () => {
    const html = nextRoundButton(null, true, t);
    expect(html).toContain('data-action="next-round"');
    expect(html).toContain(t.btnNextRound);
    expect(html).not.toContain('disabled');
    expect(html).not.toMatch(/waiting|peer-ready/);
  });

  it('нажали мы — кнопка погашена и ждёт', () => {
    const html = nextRoundButton({ waiting: true, peerReady: false }, true, t);
    expect(html).toContain('class="btn waiting"');
    expect(html).toContain('disabled');
    expect(html).toContain(t.btnWaiting);
  });

  it('соперник нажал первым — кнопка активна и зовёт', () => {
    const html = nextRoundButton({ waiting: false, peerReady: true }, true, t);
    expect(html).toContain('class="btn peer-ready"');
    expect(html).not.toContain('disabled');
    expect(html).toContain(t.btnPeerReady);
  });

  it('ни то ни другое — обычная кнопка; без внешнего игрока договор игнорируется', () => {
    expect(nextRoundButton({ waiting: false, peerReady: false }, true, t)).toContain(t.btnNextRound);
    const local = nextRoundButton({ waiting: true, peerReady: true }, false, t);
    expect(local).toContain(t.btnNextRound);
    expect(local).not.toContain('disabled');
  });
});
