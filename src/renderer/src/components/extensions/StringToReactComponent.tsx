// eslint-disable-next-line no-restricted-imports -- needs the React runtime object itself, injected into sandboxed transpiled user components
import * as React from 'react';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { transpileJsxString } from '@common/jsx-transpiler';

type SucraseOptions = {
  transforms?: Array<'jsx' | 'typescript' | 'imports' | 'flow' | 'react-hot-loader' | 'jest'>;
  production?: boolean;
  [key: string]: unknown;
};

export type StringToReactComponentProps = {
  data?: object;
  babelOptions?: SucraseOptions;
  children?: string;
};

const DEFAULT_SUCRASE_OPTIONS: SucraseOptions = {};

const createBlobUrl = (code: string): string => {
  const blob = new Blob([code], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};

const loadModule = async (blobUrl: string, react: typeof React): Promise<ComponentType> => {
  try {
    const module = await import(/* @vite-ignore */ blobUrl);
    return (module?.default || module)(react);
  } catch (error) {
    throw new Error(`StringToReactComponent: failed to load module - ${error}`);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
};

const StringToReactComponent = ({ data, babelOptions, children }: StringToReactComponentProps) => {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const loadIdRef = useRef(0);
  const resolvedOptions = babelOptions ?? DEFAULT_SUCRASE_OPTIONS;

  useEffect(() => {
    const currentLoadId = ++loadIdRef.current;

    if (!children) {
      return;
    }

    if (typeof children !== 'string') {
      throw new Error('StringToReactComponent: children must be a string');
    }

    let blobUrl: string | undefined;
    try {
      const transpiled = transpileJsxString(children, resolvedOptions);
      blobUrl = createBlobUrl(transpiled);
      void loadModule(blobUrl, React).then((LoadedComponent) => {
        if (typeof LoadedComponent !== 'function') {
          throw new Error('StringToReactComponent: code inside the passed string must be a function');
        }
        if (currentLoadId === loadIdRef.current) {
          setComponent(() => LoadedComponent);
        }
      });
    } catch (error) {
      if (currentLoadId === loadIdRef.current) {
        throw error;
      }
    }
  }, [children, resolvedOptions]);

  if (!children || !Component) {
    return null;
  }

  return <Component {...data} />;
};

export default StringToReactComponent;
