declare module 'react-native-syntax-highlighter' {
    import * as React from 'react';
  
    export interface SyntaxHighlighterProps {
      language?: string;
      style?: any;
      highlighter?: 'hljs' | 'prism' | string;
      PreTag?: React.ComponentType<any> | string;
      CodeTag?: React.ComponentType<any> | string;
      customStyle?: any;
      codeTagProps?: any;
      children?: string;
    }
  
    export default class SyntaxHighlighter extends React.Component<SyntaxHighlighterProps> {}
  }

  declare module 'react-syntax-highlighter/styles/*' {
    const styles: Record<string, any>;
    export default styles;
  }
  