export interface Question {
  id: string;
  muscleIndex: number; // 0-9
  layer: 1 | 2;
  text: string;
  reversed: boolean;
}

export interface Muscle {
  index: number;
  name: string;
  nameEn: string;
}

export const MUSCLES: Muscle[] = [
  { index: 0, name: '好奇心', nameEn: 'Curiosity' },
  { index: 1, name: '傾聴', nameEn: 'Active Listening' },
  { index: 2, name: '共感', nameEn: 'Empathy' },
  { index: 3, name: '勇気', nameEn: 'Courage' },
  { index: 4, name: '意見', nameEn: 'Opinion' },
  { index: 5, name: '反対意見', nameEn: 'Disagreement' },
  { index: 6, name: '言葉への自信', nameEn: 'Verbal Self-Confidence' },
  { index: 7, name: '妥協', nameEn: 'Compromising' },
  { index: 8, name: '活動家', nameEn: 'Activist' },
  { index: 9, name: '動員', nameEn: 'Mobilization' },
];

export const QUESTIONS: Question[] = [
  // 1. 好奇心
  { id: 'Q1-1', muscleIndex: 0, layer: 1, text: '自分と異なる意見に対して、否定より先に「なぜそう思うのか」と興味を持っている', reversed: false },
  { id: 'Q1-2', muscleIndex: 0, layer: 1, text: '知らないことや新しい視点に対して、開かれた姿勢でいる', reversed: false },
  { id: 'Q1-3', muscleIndex: 0, layer: 1, text: '対話の中で、相手の考えをもっと深く聞きたいという気持ちが自然に生まれる', reversed: false },
  { id: 'Q1-4', muscleIndex: 0, layer: 2, text: 'この組織では、新しいアイデアや異なる視点が歓迎される', reversed: false },
  { id: 'Q1-5', muscleIndex: 0, layer: 2, text: 'メンバーが互いの考えに興味を持ち、深掘りする対話がある', reversed: false },
  { id: 'Q1-6', muscleIndex: 0, layer: 2, text: '「それは現実的でない」と新しいアイデアが早期に否定されることが多い', reversed: true },

  // 2. 傾聴
  { id: 'Q2-1', muscleIndex: 1, layer: 1, text: '相手が話している間、反論を考えるより相手の言葉に集中している', reversed: false },
  { id: 'Q2-2', muscleIndex: 1, layer: 1, text: '相手の発言の意図が曖昧なとき、確認する質問をしている', reversed: false },
  { id: 'Q2-3', muscleIndex: 1, layer: 1, text: '自分が理解できていない場合、素直に「わからない」と伝えている', reversed: false },
  { id: 'Q2-4', muscleIndex: 1, layer: 2, text: 'この組織の会議では、誰かが話している間は最後まで聞く文化がある', reversed: false },
  { id: 'Q2-5', muscleIndex: 1, layer: 2, text: '発言者の意図が十分に確認されないまま議論が進むことが少ない', reversed: false },
  { id: 'Q2-6', muscleIndex: 1, layer: 2, text: '話の途中で遮られたり、結論だけ求められることが多い', reversed: true },

  // 3. 共感
  { id: 'Q3-1', muscleIndex: 2, layer: 1, text: '意見が異なる相手でも、その人がなぜそう考えるか理解しようとしている', reversed: false },
  { id: 'Q3-2', muscleIndex: 2, layer: 1, text: '自分とは異なる立場・背景を持つ人の気持ちを想像している', reversed: false },
  { id: 'Q3-3', muscleIndex: 2, layer: 1, text: '議論の場で、相手の言葉の背景にある事情を考えながら聞いている', reversed: false },
  { id: 'Q3-4', muscleIndex: 2, layer: 2, text: 'この組織では、他部門や立場の異なる人の事情が考慮されて議論が進む', reversed: false },
  { id: 'Q3-5', muscleIndex: 2, layer: 2, text: '会議で少数派の立場に立って考えようとする雰囲気がある', reversed: false },
  { id: 'Q3-6', muscleIndex: 2, layer: 2, text: '自分の部門・立場の論理だけで話が進むことが多い', reversed: true },

  // 4. 勇気
  { id: 'Q4-1', muscleIndex: 3, layer: 1, text: '不快に感じることがあっても、その場で正直に伝えている', reversed: false },
  { id: 'Q4-2', muscleIndex: 3, layer: 1, text: 'どう思われるかより、正しいと思うことを優先して発言している', reversed: false },
  { id: 'Q4-3', muscleIndex: 3, layer: 1, text: '失敗や批判を恐れず、自分の考えを表明している', reversed: false },
  { id: 'Q4-4', muscleIndex: 3, layer: 2, text: 'この組織では、本音を言っても安全だと感じられる', reversed: false },
  { id: 'Q4-5', muscleIndex: 3, layer: 2, text: '「正しいことを言う」より「空気を読む」ことが求められる', reversed: true },
  { id: 'Q4-6', muscleIndex: 3, layer: 2, text: 'ありのままの自分で参加できる雰囲気がある', reversed: false },

  // 5. 意見
  { id: 'Q5-1', muscleIndex: 4, layer: 1, text: '議論の場で、「どちらでもいい」と曖昧にせず自分の立場を表明している', reversed: false },
  { id: 'Q5-2', muscleIndex: 4, layer: 1, text: 'なぜそう思うのか、根拠を持って意見を述べている', reversed: false },
  { id: 'Q5-3', muscleIndex: 4, layer: 1, text: '自分の意見が求められていない場面でも、必要と感じたら発言している', reversed: false },
  { id: 'Q5-4', muscleIndex: 4, layer: 2, text: 'この組織では、メンバーが根拠を持って自分の意見を述べる場面が多い', reversed: false },
  { id: 'Q5-5', muscleIndex: 4, layer: 2, text: '「どちらでもいいです」「上の決定に従います」という回答が多い', reversed: true },
  { id: 'Q5-6', muscleIndex: 4, layer: 2, text: '自分の立場を明確にして発言することが評価される文化がある', reversed: false },

  // 6. 反対意見
  { id: 'Q6-1', muscleIndex: 5, layer: 1, text: '相手の意見に反対するとき、感情的にならず建設的に伝えている', reversed: false },
  { id: 'Q6-2', muscleIndex: 5, layer: 1, text: '「反対のための反対」ではなく、より良くするための異議を述べている', reversed: false },
  { id: 'Q6-3', muscleIndex: 5, layer: 1, text: '反対意見を言った後も、相手との関係を壊さずにいる', reversed: false },
  { id: 'Q6-4', muscleIndex: 5, layer: 2, text: 'この組織では、反対意見を言っても関係が壊れない', reversed: false },
  { id: 'Q6-5', muscleIndex: 5, layer: 2, text: '決定事項への反論が、後になってではなく議論の場で出てくる', reversed: false },
  { id: 'Q6-6', muscleIndex: 5, layer: 2, text: '表向きは賛成しておいて、後から陰で不満が出ることが多い', reversed: true },

  // 7. 言葉への自信
  { id: 'Q7-1', muscleIndex: 6, layer: 1, text: '上司や経営層がいる場でも、自分の意見を発言している', reversed: false },
  { id: 'Q7-2', muscleIndex: 6, layer: 1, text: '自分の考えを、相手にわかるように言語化して伝えている', reversed: false },
  { id: 'Q7-3', muscleIndex: 6, layer: 1, text: '自分の意見が少数派でも、発言することを躊躇わない', reversed: false },
  { id: 'Q7-4', muscleIndex: 6, layer: 2, text: 'この組織では、役職に関係なく誰もが意見を言える雰囲気がある', reversed: false },
  { id: 'Q7-5', muscleIndex: 6, layer: 2, text: '発言した内容で後から不利益を受けることがない', reversed: false },
  { id: 'Q7-6', muscleIndex: 6, layer: 2, text: '会議では発言する人が固定されている', reversed: true },

  // 8. 妥協
  { id: 'Q8-1', muscleIndex: 7, layer: 1, text: '自分の意見が通らないとき、より良い解を探すために柔軟に動いている', reversed: false },
  { id: 'Q8-2', muscleIndex: 7, layer: 1, text: '対立する意見を統合して、新しい案を提案していることがある', reversed: false },
  { id: 'Q8-3', muscleIndex: 7, layer: 1, text: '合意形成のプロセスに、粘り強く参加している', reversed: false },
  { id: 'Q8-4', muscleIndex: 7, layer: 2, text: 'この組織では、意見の対立が「どちらかが勝つ」ではなく「より良い案を探す」方向に向かう', reversed: false },
  { id: 'Q8-5', muscleIndex: 7, layer: 2, text: '合意が取れるまで対話を続けるための時間が確保されている', reversed: false },
  { id: 'Q8-6', muscleIndex: 7, layer: 2, text: '声が大きい人や立場が上の人の意見に落ち着くことが多い', reversed: true },

  // 9. 活動家
  { id: 'Q9-1', muscleIndex: 8, layer: 1, text: '組織や職場をより良くするために、自発的に行動を起こしている', reversed: false },
  { id: 'Q9-2', muscleIndex: 8, layer: 1, text: '「変えたい」と思ったことを、言葉だけでなく行動に移している', reversed: false },
  { id: 'Q9-3', muscleIndex: 8, layer: 1, text: '小さなことでも、変化を起こすための一歩を踏み出している', reversed: false },
  { id: 'Q9-4', muscleIndex: 8, layer: 2, text: 'この組織では、課題を感じたメンバーが自発的に改善を提案する文化がある', reversed: false },
  { id: 'Q9-5', muscleIndex: 8, layer: 2, text: '「やってみよう」と行動に移す人が評価される', reversed: false },
  { id: 'Q9-6', muscleIndex: 8, layer: 2, text: '提案しても「前例がない」「リスクがある」と止まることが多い', reversed: true },

  // 10. 動員
  { id: 'Q10-1', muscleIndex: 9, layer: 1, text: '重要だと思うことに、他者を巻き込んで一緒に動いている', reversed: false },
  { id: 'Q10-2', muscleIndex: 9, layer: 1, text: '周囲の関心や動機を理解した上で、協力を求めている', reversed: false },
  { id: 'Q10-3', muscleIndex: 9, layer: 1, text: '一人で抱え込まず、仲間を増やして動くことを意識している', reversed: false },
  { id: 'Q10-4', muscleIndex: 9, layer: 2, text: 'この組織では、変革や新しい取り組みに自発的に参加するメンバーが多い', reversed: false },
  { id: 'Q10-5', muscleIndex: 9, layer: 2, text: '誰かが旗を振ったとき、周囲が応じて動く文化がある', reversed: false },
  { id: 'Q10-6', muscleIndex: 9, layer: 2, text: '「誰かがやるだろう」という傍観者意識を感じることが多い', reversed: true },
];

export const LAYER1_QUESTIONS = QUESTIONS.filter(q => q.layer === 1);
export const LAYER2_QUESTIONS = QUESTIONS.filter(q => q.layer === 2);

// 行動実績バージョン：意識ではなく「この半年で実際にあったか」を問う
export const BEHAVIORAL_QUESTION_TEXTS: Record<string, string> = {
  // 好奇心 - 個人
  'Q1-1': 'この半年で、自分と異なる意見を持つ相手に「なぜそう思うのか」と質問した',
  'Q1-2': 'この半年で、知らないことや新しい視点を素直に受け入れた',
  'Q1-3': 'この半年で、対話の中で相手の考えをもっと深く聞こうと追加の質問をした',
  // 好奇心 - 組織
  'Q1-4': 'この半年で、自分の組織で新しいアイデアや異なる視点が実際に採り上げられた',
  'Q1-5': 'この半年で、メンバー同士が互いの考えを深掘りする対話の場があった',
  'Q1-6': 'この半年で、新しいアイデアが「現実的でない」と早期に否定された場面があった',

  // 傾聴 - 個人
  'Q2-1': 'この半年で、相手が話している間、反論より先に相手の言葉に集中した',
  'Q2-2': 'この半年で、相手の発言の意図が曖昧なとき、確認の質問をした',
  'Q2-3': 'この半年で、理解できていないとき「わからない」と素直に伝えた',
  // 傾聴 - 組織
  'Q2-4': 'この半年で、会議でメンバーの話が最後まで遮られずに聞かれた場面があった',
  'Q2-5': 'この半年で、発言者の意図が確認されてから議論が進んだ場面があった',
  'Q2-6': 'この半年で、話の途中で遮られたり結論だけを求められた場面があった',

  // 共感 - 個人
  'Q3-1': 'この半年で、意見が異なる相手がなぜそう考えるか理解しようとした',
  'Q3-2': 'この半年で、異なる立場・背景を持つ人の気持ちを想像して行動した',
  'Q3-3': 'この半年で、議論の場で相手の言葉の背景にある事情を考えながら聞いた',
  // 共感 - 組織
  'Q3-4': 'この半年で、他部門や立場の異なる人の事情が考慮されて議論が進んだ場面があった',
  'Q3-5': 'この半年で、会議で少数派の立場に立って考えようとした発言や行動があった',
  'Q3-6': 'この半年で、自分の部門・立場の論理だけで話が進んだ場面があった',

  // 勇気 - 個人
  'Q4-1': 'この半年で、不快に感じたことをその場で正直に伝えた',
  'Q4-2': 'この半年で、どう思われるかより正しいと思うことを優先して発言した',
  'Q4-3': 'この半年で、失敗や批判を恐れずに自分の考えを表明した',
  // 勇気 - 組織
  'Q4-4': 'この半年で、本音を言っても安全だと感じられる場面があった',
  'Q4-5': 'この半年で、「正しいことを言う」より「空気を読む」ことが求められた場面があった',
  'Q4-6': 'この半年で、ありのままの自分で参加できると感じた場面があった',

  // 意見 - 個人
  'Q5-1': 'この半年で、議論の場で曖昧にせず自分の立場を明確に表明した',
  'Q5-2': 'この半年で、なぜそう思うのか根拠を持って意見を述べた',
  'Q5-3': 'この半年で、求められていない場面でも必要と感じて発言した',
  // 意見 - 組織
  'Q5-4': 'この半年で、メンバーが根拠を持って自分の意見を述べた場面があった',
  'Q5-5': 'この半年で、「どちらでもいいです」「上の決定に従います」という回答が多く出た場面があった',
  'Q5-6': 'この半年で、自分の立場を明確にして発言したメンバーが評価された場面があった',

  // 反対意見 - 個人
  'Q6-1': 'この半年で、相手の意見に反対するとき感情的にならず建設的に伝えた',
  'Q6-2': 'この半年で、より良くするための建設的な異議を述べた',
  'Q6-3': 'この半年で、反対意見を言った後も相手との関係を良好に保てた',
  // 反対意見 - 組織
  'Q6-4': 'この半年で、反対意見を言っても関係が壊れなかった場面があった',
  'Q6-5': 'この半年で、決定事項への反論が議論の場で出てきた場面があった',
  'Q6-6': 'この半年で、表向きは賛成しながら後から陰で不満が出た場面があった',

  // 言葉への自信 - 個人
  'Q7-1': 'この半年で、上司や経営層がいる場でも自分の意見を発言した',
  'Q7-2': 'この半年で、自分の考えを相手にわかるように言語化して伝えた',
  'Q7-3': 'この半年で、自分の意見が少数派でも躊躇わずに発言した',
  // 言葉への自信 - 組織
  'Q7-4': 'この半年で、役職に関係なく誰もが意見を言えた場面があった',
  'Q7-5': 'この半年で、発言した内容で後から不利益を受けた人がいなかった',
  'Q7-6': 'この半年で、会議での発言者が特定の人に偏っていた場面があった',

  // 妥協 - 個人
  'Q8-1': 'この半年で、自分の意見が通らなかったとき、より良い解を一緒に探した',
  'Q8-2': 'この半年で、対立する意見を統合した新しい案を提案した',
  'Q8-3': 'この半年で、合意が得られるまで粘り強く対話に参加した',
  // 妥協 - 組織
  'Q8-4': 'この半年で、意見の対立が「より良い案を探す」方向に向かった場面があった',
  'Q8-5': 'この半年で、合意が取れるまで対話を続けるための時間が確保された場面があった',
  'Q8-6': 'この半年で、声が大きい人や立場が上の人の意見に落ち着いた場面があった',

  // 活動家 - 個人
  'Q9-1': 'この半年で、組織や職場をより良くするために自発的に行動を起こした',
  'Q9-2': 'この半年で、「変えたい」と思ったことを言葉だけでなく行動に移した',
  'Q9-3': 'この半年で、小さなことでも変化を起こすための一歩を踏み出した',
  // 活動家 - 組織
  'Q9-4': 'この半年で、課題を感じたメンバーが自発的に改善を提案した場面があった',
  'Q9-5': 'この半年で、「やってみよう」と行動に移した人が実際に評価された場面があった',
  'Q9-6': 'この半年で、提案が「前例がない」「リスクがある」と止まった場面があった',

  // 動員 - 個人
  'Q10-1': 'この半年で、重要と思うことに他者を巻き込んで一緒に動いた',
  'Q10-2': 'この半年で、周囲の関心や動機を理解した上で協力を求めた',
  'Q10-3': 'この半年で、一人で抱え込まず仲間を増やして動いた',
  // 動員 - 組織
  'Q10-4': 'この半年で、変革や新しい取り組みに自発的に参加したメンバーがいた',
  'Q10-5': 'この半年で、誰かが旗を振ったとき周囲が応じて実際に動いた場面があった',
  'Q10-6': 'この半年で、「誰かがやるだろう」という傍観者意識を感じた場面があった',
};

export function transformScore(score: number, reversed: boolean): number {
  if (reversed) {
    return 5 - score + 1;
  }
  return score;
}
