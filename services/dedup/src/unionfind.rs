//! Disjoint-set forest with path compression and union by size.
//! Used to turn pairwise "same job" matches into connected groups.

pub struct UnionFind {
    parent: Vec<usize>,
    size: Vec<usize>,
}

impl UnionFind {
    pub fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            size: vec![1; n],
        }
    }

    pub fn find(&mut self, x: usize) -> usize {
        let mut root = x;
        while self.parent[root] != root {
            root = self.parent[root];
        }
        let mut cur = x;
        while self.parent[cur] != root {
            let next = self.parent[cur];
            self.parent[cur] = root;
            cur = next;
        }
        root
    }

    /// Returns true when the two were in different sets before the call.
    pub fn union(&mut self, a: usize, b: usize) -> bool {
        let (mut ra, mut rb) = (self.find(a), self.find(b));
        if ra == rb {
            return false;
        }
        if self.size[ra] < self.size[rb] {
            std::mem::swap(&mut ra, &mut rb);
        }
        self.parent[rb] = ra;
        self.size[ra] += self.size[rb];
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unions_form_components() {
        let mut uf = UnionFind::new(5);
        assert!(uf.union(0, 1));
        assert!(uf.union(3, 4));
        assert!(!uf.union(1, 0));
        assert_eq!(uf.find(0), uf.find(1));
        assert_ne!(uf.find(0), uf.find(3));
        assert!(uf.union(1, 4));
        assert_eq!(uf.find(0), uf.find(3));
        assert_ne!(uf.find(2), uf.find(0));
    }
}
