/* Offline, privacy-preserving spelling correction for Bay Area destinations.
 * Weighted Damerau-Levenshtein candidates, informed by observed stop-name frequency.
 * Suggestions only: never silently replace an explicit house number or exact place. */
(function (root) {
  const common = ['library','public','hospital','airport','university','college','museum','station','terminal','downtown','center','centre','park','transit','caltrain','bart','chase','arena','stadium','campus','city','hall','street','avenue','plaza','market','ferry','building','school','powell','montgomery','embarcadero','civic','broadway','diridon','fruitvale','ashby','macarthur','sunnyvale','berkeley','oakland','fremont','milpitas','cupertino','palo','alto','sanjose','san','jose','francisco','mountain','view','santa','clara','redwood','menlo','brentwood','dublin','pleasanton','hayward','richmond','concord','walnut','creek','saratoga','campbell','burlingame','millbrae','union','city'];
  const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  function edits(a,b) {
    const rows = Array.from({length:a.length+1},()=>new Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++) rows[i][0]=i;
    for(let j=0;j<=b.length;j++) rows[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
      rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) rows[i][j]=Math.min(rows[i][j],rows[i-2][j-2]+1);
    }
    return rows[a.length][b.length];
  }
  function correct(query, observed = new Map()) {
    const words=norm(query).split(' ');
    if(words.some(w=>/^\d/.test(w)))return norm(query);
    const lexicon=new Map(common.map(w=>[w,3]));
    for(const [word,count] of observed)if(word.length>=4)lexicon.set(word,(lexicon.get(word)||0)+count);
    return words.map(word=>{
      if(word.length<4||lexicon.has(word))return word;
      const max=word.length>=7?2:1;
      let best=word,bestScore=-Infinity;
      for(const [candidate,frequency] of lexicon){
        if(Math.abs(candidate.length-word.length)>max||candidate[0]!==word[0])continue;
        const d=edits(word,candidate);
        if(d>max)continue;
        const score=-d*100+Math.log2(frequency+1)*3;
        if(score>bestScore){best=candidate;bestScore=score;}
      }
      return best;
    }).join(' ');
  }
  root.RoveSearchIntelligence={correct,edits};
})(typeof window!=='undefined'?window:globalThis);
