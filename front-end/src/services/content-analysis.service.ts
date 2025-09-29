import { ToxicLabel } from '../types/video-analyzer.types';

type SeverityLevel = 'High' | 'Medium' | 'Low';
// type LanguageCode = 'english' | 'spanish' | 'french' | 'german' | 'portuguese' | 'thai' | 'malay' | 'hungarian' | 'romanian' | 'dutch' | 'czech' | 'slovak' | 'danish';

interface ProfanityMatch {
word: string;
severity: SeverityLevel;
language?: string;
}

interface ProfanityLists {
[key: string]: {
    high: string[];
    medium: string[];
    low: string[];
}
}

const PROFANITY_LISTS: ProfanityLists = {
  english: {
      high: [
          'fuck', 'fucking', 'fucked', 'fucker', 'fucks', 'motherfuck', 'motherfucker',
          'shit', 'shitting', 'shitted', 'shithead', 'bullshit',
          'cunt', 'cunts',
          'cock', 'cocks', 'cocksucker',
          'dick', 'dicks', 'dickhead',
          'pussy', 'pussies',
          'whore', 'whores',
          'slut', 'sluts',
          'bitch', 'bitches', 'bitching', 'son of a bitch',
          'bastard', 'bastards',
          'nigger', 'nigga',
          'faggot', 'fag',
          'retard', 'retarded'
      ],
      medium: [
          'ass', 'asses', 'asshole', 'assholes',
          'damn', 'damned', 'goddamn',
          'piss', 'pissed', 'pissing',
          'twat', 'twats',
          'wanker', 'wankers',
          'tits', 'titties', 'tit',
          'balls',
          'bollocks',
          'prick', 'pricks',
          'hooker', 'hookers',
          'jackass', 'dumbass'
      ],
      low: [
          'crap', 'crappy',
          'hell',
          'damn',
          'suck', 'sucks', 'sucking',
          'dumb',
          'idiot', 'idiots',
          'stupid',
          'moron', 'morons',
          'screw', 'screwed',
          'jesus christ', 'goddamn',
          'bloody'
      ]
  },
  spanish: {
      high: [
          'puta', 'putas', 'puto', 'putos',
          'mierda', 'mierdas',
          'coño', 'coños',
          'joder', 'jodido', 'jodida', 'jodete',
          'carajo',
          'chinga', 'chingar', 'chingada', 'chingado', 'chingon',
          'verga', 'vergas',
          'pendejo', 'pendeja', 'pendejos', 'pendejas',
          'hijo de puta', 'hija de puta',
          'maricón', 'maricon', 'marica',
          'pinche', 'pinches',
          'culero', 'culera'
      ],
      medium: [
          'culo', 'culos',
          'idiota', 'idiotas',
          'cabrón', 'cabron', 'cabrona',
          'polla', 'pollas',
          'gilipollas',
          'coger', 'coge',
          'tonto del culo',
          'mamón', 'mamon',
          'pedo', 'pedos',
          'cagar', 'cagado', 'cagada'
      ],
      low: [
          'maldito', 'maldita',
          'estúpido', 'estupido',
          'tonto', 'tonta',
          'imbécil', 'imbecil',
          'demonios',
          'maldición', 'maldicion',
          'burro', 'burra',
          'tarado', 'tarada'
      ]
  },
  french: {
      high: [
          'putain', 'putains',
          'merde',
          'connard', 'connards', 'connasse',
          'salope', 'salopes',
          'enculé', 'encule', 'enculer',
          'branler', 'branleur',
          'bite', 'bites',
          'nique', 'niquer',
          'foutre', 'foutrer',
          'pédé', 'pede', 'pédale', 'pedale'
      ],
      medium: [
          'con', 'cons', 'conne',
          'cul', 'culs',
          'bordel',
          'chier', 'chieur',
          'couilles',
          'garce',
          'pute', 'putes',
          'salaud', 'salauds',
          'zut', 'zut alors'
      ],
      low: [
          'idiot', 'idiote',
          'crétin', 'cretin',
          'imbécile', 'imbecile',
          'merde',
          'mince',
          'zut',
          'flûte', 'flute',
          'diantre'
      ]
  },
  german: {
      high: [
          'scheiße', 'scheisse', 'scheiss',
          'fick', 'ficken', 'gefickt',
          'hure', 'huren',
          'fotze', 'fotzen',
          'wichser', 'wixer',
          'hurensohn',
          'arschloch',
          'schwuchtel',
          'neger',
          'nutte', 'nutten'
      ],
      medium: [
          'arsch', 'ärsche', 'arsche',
          'schwein', 'schweine',
          'verdammt',
          'kacke',
          'schlampe', 'schlampen',
          'miststück', 'miststuck',
          'sau', 'säue',
          'trottel'
      ],
      low: [
          'dummkopf',
          'idiot', 'idioten',
          'blöd', 'bloed',
          'depp', 'deppen',
          'mist',
          'quatsch',
          'scheibenkleister'
      ]
  },
  portuguese: {
    high: [
        'puta', 'putas',
        'caralho', 'caralhos',
        'foder', 'fode', 'fodido', 'fodida',
        'merda', 'merdas',
        'filho da puta', 'filha da puta',
        'porra',
        'buceta', 'bucetas',
        'viado', 'viados',
        'bicha',
        'cuzão', 'cuzao',
        'piroca',
        'pau no cu'
    ],
    medium: [
        'cu', 'cus',
        'bosta',
        'cacete',
        'idiota', 'idiotas',
        'babaca',
        'otário', 'otario',
        'imbecil',
        'corno', 'corna',
        'vadia', 'vadias'
    ],
    low: [
        'droga', 'drogas',
        'burro', 'burra',
        'estúpido', 'estupido',
        'tonto', 'tonta',
        'besta',
        'chato', 'chata',
        'raios',
        'diabo'
    ]
},

thai: {
    high: [
        'ควย',     // kuai
        'เหี้ย',    // hia
        'สัส',      // sat
        'มึง',      // mueng
        'ไอ้สัตว์',  // ai sat
        'กระหรี่',   // gra-ree
        'อีดอก',    // ee-dok
        'เย็ด',     // yed
        'แม่ง',     // maeng
        'ระยำ'      // ra-yam
    ],
    medium: [
        'ไอ้',      // ai
        'อี',       // ee
        'วะ',      // wa
        'โง่',      // ngo
        'บ้า',      // baa
        'ห่า',      // ha
        'เฮี้ย',    // hia (milder form)
        'ไอ้บ้า'    // ai baa
    ],
    low: [
        'โธ่',      // tho
        'เซ่อ',     // ser
        'งก',      // ngok
        'อ้วน',     // uan
        'อีตา',     // ee-ta
        'บ้าบอ'     // baa-bor
    ]
},

malay: {
    high: [
        'puki', 'pepek',
        'pantat', 'butuh',
        'lanciau', 'lancau',
        'butoh', 'burit',
        'keparat',
        'babi', 'anjing',
        'sundal', 'sundal',
        'pukimak', 'kimak',
        'celaka'
    ],
    medium: [
        'bodoh', 'bengap',
        'sial', 'celaka',
        'bangsat', 'bangang',
        'kepala bana',
        'gila',
        'biadap', 'kunyuk',
        'haram jadah'
    ],
    low: [
        'bodoh',
        'gila',
        'setan',
        'bebal',
        'dungu',
        'tolol',
        'bengong',
        'bongok'
    ]
},
hungarian: {
  high: [
      'bassza', 'baszd',
      'kurva', 'kurvák',
      'fasz', 'faszom',
      'picsába', 'picsa',
      'szar', 'szarok',
      'geci', 'gecibe',
      'kibaszott',
      'bazmeg', 'bazd meg',
      'anyád', 'anyádat'
  ],
  medium: [
      'segg', 'seggfej',
      'marha', 'marhaság',
      'hülye', 'hülyeség',
      'franc', 'francba',
      'dög', 'dögölj',
      'büdös',
      'rohadt', 'rohadék'
  ],
  low: [
      'fenébe',
      'francba',
      'basszus',
      'hülyeség',
      'marhaság',
      'barom',
      'buta',
      'ostoba'
  ]
},

romanian: {
  high: [
      'pula', 'pule',
      'pizdă', 'pizda',
      'futu-ți', 'fut',
      'căcat', 'cacat',
      'muie', 'muist',
      'curva', 'curve',
      'pulă', 'pula',
      'sugi', 'sugaci'
  ],
  medium: [
      'rahat',
      'căcat', 'cacat',
      'prostule', 'proasta',
      'tâmpit', 'tampit',
      'idiot', 'idioată',
      'măgar', 'magar',
      'nenorocit'
  ],
  low: [
      'prost',
      'fraier',
      'bou', 'boule',
      'dobitoc',
      'cretin',
      'tâmpit',
      'nemernic'
  ]
},

dutch: {
  high: [
      'kut', 'kutten',
      'klootzak', 'klote',
      'lul', 'lullen',
      'hoer', 'hoeren',
      'kanker', 'kenker',
      'godver', 'godverdomme',
      'tyfus', 'tering',
      'neuk', 'neuken'
  ],
  medium: [
      'kak', 'stront',
      'sukkel', 'sukkels',
      'trut', 'trutten',
      'reet', 'reetketel',
      'stomme',
      'verdomme',
      'rotzooi'
  ],
  low: [
      'stom',
      'idioot',
      'sukkel',
      'dombo',
      'mafkees',
      'sufferd',
      'dwaas'
  ]
},

czech: {
  high: [
      'kurva', 'kurvy',
      'píča', 'pica',
      'čurák', 'curak',
      'zmrd', 'zmrdi',
      'kokot', 'kokoti',
      'prdel', 'do prdele',
      'hovno', 'srat',
      'mrdka', 'mrdat'
  ],
  medium: [
      'debil', 'debilní',
      'kretén', 'kreten',
      'vůl', 'vole',
      'idiot', 'idioti',
      'blbec', 'blbý',
      'pitomec'
  ],
  low: [
      'blbost',
      'pitomý',
      'hloupý',
      'tupý',
      'hovado',
      'trouba',
      'trdlo'
  ]
},

slovak: {
  high: [
      'kurva', 'kurvy',
      'piča', 'pica',
      'čurák', 'curak',
      'kokot', 'kokoti',
      'jebať', 'jebnutý',
      'do riti',
      'srat', 'ser',
      'mrdka', 'mrdat'
  ],
  medium: [
      'debil', 'debilný',
      'kretén', 'kreten',
      'vôl', 'vole',
      'idiot', 'idioti',
      'hlupák', 'sprostý',
      'chuj', 'chujovina'
  ],
  low: [
      'blbosť',
      'sprostý',
      'hlúpy',
      'tupý',
      'somár',
      'truľo',
      'trkvas'
  ]
},

danish: {
  high: [
      'fanden', 'fandens',
      'kraftedeme', 'kraftedme',
      'kælling', 'kaelling',
      'luder', 'ludere',
      'pik', 'pikken',
      'røv', 'roev',
      'kneppe', 'kneppede',
      'kusse', 'kusser'
  ],
  medium: [
      'lort', 'lorte',
      'skid', 'skide',
      'idiot', 'idioter',
      'dumme',
      'fjols', 'fjolser',
      'røvhul', 'roevhul',
      'pis', 'pisse'
  ],
  low: [
      'dum',
      'tåbelig', 'taabelig',
      'fjollet',
      'pokkers',
      'søren', 'soeren',
      'sgu',
      'møg', 'moeg'
  ]
}
};

const normalizeText = (text: string): string => {
return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '');
};

export const profanityFilter = {
words: new Set(
    Object.values(PROFANITY_LISTS).flatMap(language => 
        Object.values(language).flat()
    )
),

checkText(text: string): { 
    isProfane: boolean; 
    matches: ProfanityMatch[];
} {
    const normalizedText = normalizeText(text);
    const words = normalizedText.split(/[\s,.!?]+/);
    const matches: ProfanityMatch[] = [];

    words.forEach(word => {
        const normalizedWord = word.trim();
        
        Object.entries(PROFANITY_LISTS).forEach(([language, severityLists]) => {
            if (severityLists.high.includes(normalizedWord)) {
                matches.push({ word: normalizedWord, severity: 'High', language });
            } else if (severityLists.medium.includes(normalizedWord)) {
                matches.push({ word: normalizedWord, severity: 'Medium', language });
            } else if (severityLists.low.includes(normalizedWord)) {
                matches.push({ word: normalizedWord, severity: 'Low', language });
            }
        });
    });
    
    console.log('Profanity check:', { 
        text, 
        matches,
        normalizedText 
    });
    
    return {
        isProfane: matches.length > 0,
        matches
    };
}
};

export const analyzeMixedContent = async (text: string): Promise<ToxicLabel[]> => {
try {
    const profanityCheck = profanityFilter.checkText(text);
    
    if (profanityCheck.isProfane) {
        const highSeverity = profanityCheck.matches.filter(m => m.severity === 'High');
        const mediumSeverity = profanityCheck.matches.filter(m => m.severity === 'Medium');
        const lowSeverity = profanityCheck.matches.filter(m => m.severity === 'Low');

        const results: ToxicLabel[] = [];

        if (highSeverity.length > 0) {
            results.push({
                Name: 'PROFANITY',
                Score: 0.95,
                Severity: 'High',
                Details: `Found severe prohibited words: ${highSeverity
                    .map(m => `${m.word}${m.language ? ` (${m.language})` : ''}`)
                    .join(', ')}`
            });
        }

        if (mediumSeverity.length > 0) {
            results.push({
                Name: 'PROFANITY',
                Score: 0.75,
                Severity: 'Medium',
                Details: `Found moderate prohibited words: ${mediumSeverity
                    .map(m => `${m.word}${m.language ? ` (${m.language})` : ''}`)
                    .join(', ')}`
            });
        }

        if (lowSeverity.length > 0) {
            results.push({
                Name: 'PROFANITY',
                Score: 0.5,
                Severity: 'Low',
                Details: `Found mild prohibited words: ${lowSeverity
                    .map(m => `${m.word}${m.language ? ` (${m.language})` : ''}`)
                    .join(', ')}`
            });
        }

        return results;
    }

    return [];
} catch (error) {
    console.error('Error in content analysis:', error);
    throw error;
}
};