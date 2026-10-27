export type ReadingLocale = 'zh-CN' | 'zh-TW' | 'en-US';

export function getReadingRelevanceRules(locale: ReadingLocale): string {
  if (locale === 'en-US') {
    return `1. Read the user's exact question literally before interpreting the hexagram. Do not replace its subject, object, event, or goal with a different story.
2. The first two sentences of the integrated reading must directly answer the question with a cautious tendency (more likely / less likely / genuinely uncertain) and its reason. Do not begin with generic philosophy.
3. If a pronoun, abbreviation, or relationship is unclear, preserve that uncertainty. Never invent who a person is, their motives, or a relationship that the user did not state.
4. Classical references to marriage, enemies, rulers, journeys, illness, or other ancient situations are symbolic source language. Unless the user's question is actually about that topic, explain only the transferable pattern; never map those roles literally onto the user's life.
5. Every paragraph and every recommendation must connect to the exact question. For an exam question, discuss preparation, scope, materials, verification, and uncertainty—not unrelated romance or interpersonal conflict.
6. Before returning JSON, silently check: "Does this answer the user's actual question? Did I invent any person, motive, event, or certainty?" Revise if either answer is unsatisfactory.`;
  }

  if (locale === 'zh-TW') {
    return `1. 解讀前先按字面理解使用者原問題，不得擅自替換問題中的主體、對象、事件或目標，也不得另編故事。
2. 綜合解讀開頭兩句必須直接回應使用者真正想問的事，給出審慎傾向及理由，不得先談空泛卦理。
3. 若代名詞、縮寫或關係不明確，必須保留不確定性，不得臆測人物身分、動機或未說明的關係。
4. 經文中的婚姻、敵寇、君王、行旅與疾病等古代情境僅是原典象徵；除非問題正涉及該主題，不得直接套用到現實人物。
5. 每段分析與每條建議都必須扣緊原問題。例如考試問題應圍繞複習範圍、資料、確認方式、準備程度與不確定性，不得轉成無關的人際分析。
6. 回傳 JSON 前自行檢查：是否回答了原問題？是否憑空添加人物、動機、事件或確定結論？若有，請先修正。`;
  }

  return `1. 解读前先按字面理解用户原问题，不得擅自替换问题中的主体、对象、事件或目标，不得另编一个故事。
2. 综合解读开头两句话必须直接回应用户真正想问的事情，给出审慎的倾向（偏向会、偏向不会或信息不足）及理由；不得先说空泛卦理。
3. 若原问题含“ta”、他/她、缩写或关系不明确，必须保留这种不确定性，不得猜测人物身份、动机或用户未说明的关系。
4. 经文中的婚姻、匪寇、君王、行旅、疾病等古代情境属于原典象征。除非用户问的正是该主题，否则只能解释可迁移的结构含义，不得把古代人物关系直接套到现实人物上。
5. 每一段分析和每一条建议都必须能回扣原问题。例如考试问题应围绕复习范围、资料、确认方式、准备程度和不确定性展开，不得转成无关的感情或人际冲突分析。
6. 返回 JSON 前在内部检查：是否真正回答了用户原问题？是否凭空添加了人物、动机、事件或确定结论？如有，先改正再输出。`;
}
